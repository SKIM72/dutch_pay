(function initReceiptImageProcessor(global) {
    'use strict';

    const MAX_INPUT_BYTES = 20 * 1024 * 1024;
    const MAX_SOURCE_SIDE = 2200;
    const MAX_DETECTION_SIDE = 700;
    const MAX_OUTPUT_SIDE = 1800;
    const MAX_OUTPUT_PIXELS = 2_500_000;
    const MAX_OUTPUT_BYTES = 2.5 * 1024 * 1024;

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('IMAGE_DECODE_FAILED'));
            };
            image.src = objectUrl;
        });
    }

    function createScaledCanvas(image, maxSide) {
        const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = Math.min(1, maxSide / Math.max(1, longestSide));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('CANVAS_UNAVAILABLE');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function resizeCanvas(source, maxSide, filter = 'none') {
        const longestSide = Math.max(source.width, source.height);
        const scale = Math.min(1, maxSide / Math.max(1, longestSide));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('CANVAS_UNAVAILABLE');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.filter = filter;
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        context.filter = 'none';
        return canvas;
    }

    function calculateOtsuThreshold(histogram, totalPixels) {
        let weightedTotal = 0;
        for (let value = 0; value < 256; value += 1) weightedTotal += value * histogram[value];

        let backgroundWeight = 0;
        let backgroundTotal = 0;
        let bestVariance = 0;
        let threshold = 160;
        for (let value = 0; value < 256; value += 1) {
            backgroundWeight += histogram[value];
            if (!backgroundWeight) continue;
            const foregroundWeight = totalPixels - backgroundWeight;
            if (!foregroundWeight) break;
            backgroundTotal += value * histogram[value];
            const backgroundMean = backgroundTotal / backgroundWeight;
            const foregroundMean = (weightedTotal - backgroundTotal) / foregroundWeight;
            const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
            if (variance > bestVariance) {
                bestVariance = variance;
                threshold = value;
            }
        }
        return threshold;
    }

    function closeMask(mask, width, height) {
        const dilated = new Uint8Array(mask.length);
        const closed = new Uint8Array(mask.length);
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                let value = 0;
                for (let offsetY = -1; offsetY <= 1 && !value; offsetY += 1) {
                    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                        const nextX = x + offsetX;
                        const nextY = y + offsetY;
                        if (
                            nextX >= 0 && nextX < width
                            && nextY >= 0 && nextY < height
                            && mask[nextY * width + nextX]
                        ) {
                            value = 1;
                            break;
                        }
                    }
                }
                dilated[y * width + x] = value;
            }
        }

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                let value = 1;
                for (let offsetY = -1; offsetY <= 1 && value; offsetY += 1) {
                    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                        const nextX = x + offsetX;
                        const nextY = y + offsetY;
                        if (
                            nextX < 0 || nextX >= width
                            || nextY < 0 || nextY >= height
                            || !dilated[nextY * width + nextX]
                        ) {
                            value = 0;
                            break;
                        }
                    }
                }
                closed[y * width + x] = value;
            }
        }
        return closed;
    }

    function componentCorners(cells, gridWidth, cellSize, canvasWidth, canvasHeight) {
        const points = [];
        cells.forEach((cellIndex) => {
            const cellX = cellIndex % gridWidth;
            const cellY = Math.floor(cellIndex / gridWidth);
            const left = cellX * cellSize;
            const top = cellY * cellSize;
            const right = Math.min(canvasWidth - 1, left + cellSize);
            const bottom = Math.min(canvasHeight - 1, top + cellSize);
            points.push(
                { x: left, y: top },
                { x: right, y: top },
                { x: right, y: bottom },
                { x: left, y: bottom }
            );
        });

        return [
            points.reduce((best, point) => point.x + point.y < best.x + best.y ? point : best),
            points.reduce((best, point) => point.x - point.y > best.x - best.y ? point : best),
            points.reduce((best, point) => point.x + point.y > best.x + best.y ? point : best),
            points.reduce((best, point) => point.x - point.y < best.x - best.y ? point : best)
        ];
    }

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function quadrilateralArea(points) {
        return Math.abs(points.reduce((sum, point, index) => {
            const next = points[(index + 1) % points.length];
            return sum + point.x * next.y - point.y * next.x;
        }, 0)) / 2;
    }

    function detectReceiptCorners(canvas) {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const histogram = new Uint32Array(256);
        const pixelCount = canvas.width * canvas.height;

        for (let index = 0; index < pixels.length; index += 4) {
            const luminance = Math.round(
                pixels[index] * 0.299
                + pixels[index + 1] * 0.587
                + pixels[index + 2] * 0.114
            );
            histogram[luminance] += 1;
        }

        const threshold = Math.max(132, Math.min(218, calculateOtsuThreshold(histogram, pixelCount) + 12));
        const cellSize = Math.max(6, Math.round(Math.max(canvas.width, canvas.height) / 95));
        const gridWidth = Math.ceil(canvas.width / cellSize);
        const gridHeight = Math.ceil(canvas.height / cellSize);
        const mask = new Uint8Array(gridWidth * gridHeight);

        for (let cellY = 0; cellY < gridHeight; cellY += 1) {
            for (let cellX = 0; cellX < gridWidth; cellX += 1) {
                let brightPixels = 0;
                let samples = 0;
                const startX = cellX * cellSize;
                const startY = cellY * cellSize;
                const endX = Math.min(canvas.width, startX + cellSize);
                const endY = Math.min(canvas.height, startY + cellSize);
                for (let y = startY; y < endY; y += 2) {
                    for (let x = startX; x < endX; x += 2) {
                        const offset = (y * canvas.width + x) * 4;
                        const red = pixels[offset];
                        const green = pixels[offset + 1];
                        const blue = pixels[offset + 2];
                        const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
                        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
                        if (luminance >= threshold && chroma <= 72) brightPixels += 1;
                        samples += 1;
                    }
                }
                if (samples && brightPixels / samples >= 0.43) {
                    mask[cellY * gridWidth + cellX] = 1;
                }
            }
        }

        const connectedMask = closeMask(mask, gridWidth, gridHeight);
        const visited = new Uint8Array(connectedMask.length);
        const totalCells = connectedMask.length;
        let best = null;

        for (let start = 0; start < connectedMask.length; start += 1) {
            if (!connectedMask[start] || visited[start]) continue;
            const queue = [start];
            const cells = [];
            visited[start] = 1;
            let cursor = 0;
            let minX = gridWidth;
            let maxX = 0;
            let minY = gridHeight;
            let maxY = 0;

            while (cursor < queue.length) {
                const current = queue[cursor];
                cursor += 1;
                cells.push(current);
                const x = current % gridWidth;
                const y = Math.floor(current / gridWidth);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                const neighbors = [
                    x > 0 ? current - 1 : -1,
                    x + 1 < gridWidth ? current + 1 : -1,
                    y > 0 ? current - gridWidth : -1,
                    y + 1 < gridHeight ? current + gridWidth : -1
                ];
                neighbors.forEach((neighbor) => {
                    if (neighbor >= 0 && connectedMask[neighbor] && !visited[neighbor]) {
                        visited[neighbor] = 1;
                        queue.push(neighbor);
                    }
                });
            }

            const areaRatio = cells.length / totalCells;
            const boxWidth = maxX - minX + 1;
            const boxHeight = maxY - minY + 1;
            const fillRatio = cells.length / (boxWidth * boxHeight);
            const aspectRatio = Math.max(boxWidth, boxHeight) / Math.max(1, Math.min(boxWidth, boxHeight));
            if (
                areaRatio < 0.045 || areaRatio > 0.86
                || boxWidth < 6 || boxHeight < 8
                || fillRatio < 0.28 || aspectRatio > 7
            ) continue;

            const centerX = (minX + maxX + 1) / 2 / gridWidth;
            const centerY = (minY + maxY + 1) / 2 / gridHeight;
            const centerDistance = Math.hypot(centerX - 0.5, centerY - 0.5);
            const centerWeight = Math.max(0.55, 1 - centerDistance * 0.6);
            const score = cells.length * fillRatio * centerWeight;
            if (!best || score > best.score) {
                best = { cells, score, areaRatio };
            }
        }

        if (!best) return null;
        const points = componentCorners(best.cells, gridWidth, cellSize, canvas.width, canvas.height);
        const areaRatio = quadrilateralArea(points) / pixelCount;
        const shortSide = Math.min(
            distance(points[0], points[1]),
            distance(points[1], points[2]),
            distance(points[2], points[3]),
            distance(points[3], points[0])
        );
        if (areaRatio < 0.04 || shortSide < 80) return null;
        return { points, areaRatio };
    }

    function expandQuadrilateral(points, width, height, ratio = 0.012) {
        const center = points.reduce(
            (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
            { x: 0, y: 0 }
        );
        return points.map((point) => ({
            x: Math.max(0, Math.min(width - 1, point.x + (point.x - center.x) * ratio)),
            y: Math.max(0, Math.min(height - 1, point.y + (point.y - center.y) * ratio))
        }));
    }

    function projectiveCoefficients(points) {
        const [topLeft, topRight, bottomRight, bottomLeft] = points;
        const deltaX1 = topRight.x - bottomRight.x;
        const deltaX2 = bottomLeft.x - bottomRight.x;
        const deltaX3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
        const deltaY1 = topRight.y - bottomRight.y;
        const deltaY2 = bottomLeft.y - bottomRight.y;
        const deltaY3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
        let perspectiveX = 0;
        let perspectiveY = 0;

        if (Math.abs(deltaX3) > 0.0001 || Math.abs(deltaY3) > 0.0001) {
            const denominator = deltaX1 * deltaY2 - deltaX2 * deltaY1;
            if (Math.abs(denominator) > 0.0001) {
                perspectiveX = (deltaX3 * deltaY2 - deltaX2 * deltaY3) / denominator;
                perspectiveY = (deltaX1 * deltaY3 - deltaX3 * deltaY1) / denominator;
            }
        }

        return {
            xU: topRight.x - topLeft.x + perspectiveX * topRight.x,
            xV: bottomLeft.x - topLeft.x + perspectiveY * bottomLeft.x,
            xOffset: topLeft.x,
            yU: topRight.y - topLeft.y + perspectiveX * topRight.y,
            yV: bottomLeft.y - topLeft.y + perspectiveY * bottomLeft.y,
            yOffset: topLeft.y,
            perspectiveX,
            perspectiveY
        };
    }

    function perspectiveCrop(sourceCanvas, detectionCanvas, detection) {
        const scaleX = sourceCanvas.width / detectionCanvas.width;
        const scaleY = sourceCanvas.height / detectionCanvas.height;
        const points = expandQuadrilateral(
            detection.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
            sourceCanvas.width,
            sourceCanvas.height
        );
        const measuredWidth = Math.max(distance(points[0], points[1]), distance(points[3], points[2]));
        const measuredHeight = Math.max(distance(points[0], points[3]), distance(points[1], points[2]));
        const minimumReadableScale = Math.max(1, 700 / Math.max(1, Math.min(measuredWidth, measuredHeight)));
        const sideScale = MAX_OUTPUT_SIDE / Math.max(measuredWidth, measuredHeight);
        const pixelScale = Math.sqrt(MAX_OUTPUT_PIXELS / Math.max(1, measuredWidth * measuredHeight));
        const scale = Math.min(minimumReadableScale, sideScale, pixelScale, 2.5);
        const outputWidth = Math.max(1, Math.round(measuredWidth * scale));
        const outputHeight = Math.max(1, Math.round(measuredHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
        if (!context) throw new Error('CANVAS_UNAVAILABLE');
        const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
        if (!sourceContext) throw new Error('CANVAS_UNAVAILABLE');
        const sourcePixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
        const outputImage = context.createImageData(outputWidth, outputHeight);
        const outputPixels = outputImage.data;
        const coefficients = projectiveCoefficients(points);

        for (let outputY = 0; outputY < outputHeight; outputY += 1) {
            const normalizedY = outputHeight > 1 ? outputY / (outputHeight - 1) : 0;
            for (let outputX = 0; outputX < outputWidth; outputX += 1) {
                const normalizedX = outputWidth > 1 ? outputX / (outputWidth - 1) : 0;
                const denominator = (
                    coefficients.perspectiveX * normalizedX
                    + coefficients.perspectiveY * normalizedY
                    + 1
                );
                const sourceX = Math.max(0, Math.min(
                    sourceCanvas.width - 1,
                    (
                        coefficients.xU * normalizedX
                        + coefficients.xV * normalizedY
                        + coefficients.xOffset
                    ) / denominator
                ));
                const sourceY = Math.max(0, Math.min(
                    sourceCanvas.height - 1,
                    (
                        coefficients.yU * normalizedX
                        + coefficients.yV * normalizedY
                        + coefficients.yOffset
                    ) / denominator
                ));
                const left = Math.floor(sourceX);
                const top = Math.floor(sourceY);
                const right = Math.min(sourceCanvas.width - 1, left + 1);
                const bottom = Math.min(sourceCanvas.height - 1, top + 1);
                const horizontalWeight = sourceX - left;
                const verticalWeight = sourceY - top;
                const topLeftOffset = (top * sourceCanvas.width + left) * 4;
                const topRightOffset = (top * sourceCanvas.width + right) * 4;
                const bottomLeftOffset = (bottom * sourceCanvas.width + left) * 4;
                const bottomRightOffset = (bottom * sourceCanvas.width + right) * 4;
                const outputOffset = (outputY * outputWidth + outputX) * 4;

                for (let channel = 0; channel < 3; channel += 1) {
                    const topValue = (
                        sourcePixels[topLeftOffset + channel] * (1 - horizontalWeight)
                        + sourcePixels[topRightOffset + channel] * horizontalWeight
                    );
                    const bottomValue = (
                        sourcePixels[bottomLeftOffset + channel] * (1 - horizontalWeight)
                        + sourcePixels[bottomRightOffset + channel] * horizontalWeight
                    );
                    outputPixels[outputOffset + channel] = Math.round(
                        topValue * (1 - verticalWeight) + bottomValue * verticalWeight
                    );
                }
                outputPixels[outputOffset + 3] = 255;
            }
        }
        context.putImageData(outputImage, 0, 0);
        return canvas;
    }

    function canvasToBlob(canvas, quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => blob ? resolve(blob) : reject(new Error('IMAGE_ENCODE_FAILED')),
                'image/jpeg',
                quality
            );
        });
    }

    async function encodeReceiptCanvas(canvas) {
        let outputCanvas = resizeCanvas(canvas, MAX_OUTPUT_SIDE, 'contrast(1.12) saturate(0.82)');
        let blob = await canvasToBlob(outputCanvas, 0.84);
        if (blob.size > MAX_OUTPUT_BYTES) blob = await canvasToBlob(outputCanvas, 0.7);
        if (blob.size > MAX_OUTPUT_BYTES) {
            outputCanvas = resizeCanvas(outputCanvas, 1450, 'contrast(1.08)');
            blob = await canvasToBlob(outputCanvas, 0.72);
        }
        return { blob, canvas: outputCanvas };
    }

    async function prepare(file, options = {}) {
        if (!file || !file.type?.startsWith('image/')) throw new Error('INVALID_IMAGE');
        if (file.size > MAX_INPUT_BYTES) throw new Error('IMAGE_TOO_LARGE');

        const image = await loadImage(file);
        const sourceCanvas = createScaledCanvas(image, MAX_SOURCE_SIDE);
        let processedCanvas = sourceCanvas;
        let autoCropped = false;
        let cropAreaRatio = 0;

        if (options.autoCrop !== false && Math.min(sourceCanvas.width, sourceCanvas.height) >= 500) {
            options.onStatus?.('detecting');
            const detectionCanvas = resizeCanvas(sourceCanvas, MAX_DETECTION_SIDE);
            const detection = detectReceiptCorners(detectionCanvas);
            if (detection) {
                processedCanvas = perspectiveCrop(sourceCanvas, detectionCanvas, detection);
                autoCropped = true;
                cropAreaRatio = detection.areaRatio;
            }
        }

        options.onStatus?.('optimizing');
        const encoded = await encodeReceiptCanvas(processedCanvas);
        return {
            blob: encoded.blob,
            mimeType: 'image/jpeg',
            autoCropped,
            cropAreaRatio,
            width: encoded.canvas.width,
            height: encoded.canvas.height,
            originalWidth: image.naturalWidth,
            originalHeight: image.naturalHeight
        };
    }

    global.SettleUpReceiptImage = {
        prepare,
        warmup: () => Promise.resolve()
    };
})(window);
