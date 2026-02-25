document.addEventListener('DOMContentLoaded', async () => {

    // --- Supabase Client Initialization ---
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

    // --- Global State ---
    let settlements = [];
    let currentSettlement = null;
    let currentLang = 'ko';
    let currentEditingExpenseId = null;
    let currentUser = null; 
    const exchangeRatesCache = {};
    const SUPPORTED_CURRENCIES = ['JPY', 'KRW', 'USD'];

    // --- Element References ---
    const languageSwitcher = document.getElementById('language-switcher');
    const authBtn = document.getElementById('auth-btn'); 
    
    const userInfoDisplay = document.getElementById('user-info-display');
    const userEmailText = document.getElementById('user-email-text');

    const sidebar = document.getElementById('left-pane');
    const appTitle = document.querySelector('.brand-container');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const settlementListContainer = document.getElementById('settlement-list-container');
    const addSettlementFab = document.getElementById('add-settlement-fab');
    const placeholderRightPane = document.getElementById('placeholder-right-pane');
    const calculatorView = document.getElementById('calculator');
    
    const addSettlementModal = document.getElementById('add-settlement-modal');
    const exchangeRateModal = document.getElementById('exchange-rate-modal');
    const editExpenseModal = document.getElementById('edit-expense-modal');
    const expenseRateModal = document.getElementById('expense-rate-modal');

    const newSettlementDateInput = document.getElementById('new-settlement-date');
    const newSettlementTitleInput = document.getElementById('new-settlement-title');
    const baseCurrencySelect = document.getElementById('base-currency');
    const createSettlementBtn = document.getElementById('create-settlement-btn');
    
    const participantListContainer = document.getElementById('participant-list-container');
    const addParticipantBtn = document.getElementById('add-participant-btn');

    const copyTextBtn = document.getElementById('copy-text-btn');
    const saveImageBtn = document.getElementById('save-image-btn');
    const exchangeRateInfoBtn = document.getElementById('exchange-rate-info-btn'); 
    const exchangeRateDate = document.getElementById('exchange-rate-date');
    const exchangeRateInfo = document.getElementById('exchange-rate-info');
    
    const editExpenseIdInput = document.getElementById('edit-expense-id');
    const editItemDateInput = document.getElementById('edit-item-date'); 
    const editItemNameInput = document.getElementById('edit-item-name');
    const editItemAmountInput = document.getElementById('edit-item-amount');
    const editItemCurrencySelect = document.getElementById('edit-item-currency');
    const editItemPayerSelect = document.getElementById('edit-item-payer');
    const editSplitMethodSelect = document.getElementById('edit-split-method');
    const editSplitAmountInputs = document.getElementById('edit-split-amount-inputs');
    const saveExpenseChangesBtn = document.getElementById('save-expense-changes-btn');

    const settlementDisplay = document.getElementById('settlement-display');
    const expenseFormCard = document.getElementById('expense-form-card');
    const itemDateInput = document.getElementById('item-date');
    const itemPayerSelect = document.getElementById('item-payer');
    const itemCurrencySelect = document.getElementById('item-currency');
    const splitMethodSelect = document.getElementById('split-method');
    const splitAmountInputs = document.getElementById('split-amount-inputs');
    
    const expenseTableBody = document.querySelector('#expense-table tbody');
    const expenseTableHeaderRow = document.getElementById('expense-table-header-row');
    const totalExpenseP = document.getElementById('total-expense');
    const finalSettlementContainer = document.getElementById('final-settlement-container');
    const completeSettlementBtn = document.getElementById('complete-settlement-btn');
    const downloadExcelBtn = document.getElementById('download-excel-btn');
    const addExpenseBtn = document.getElementById('add-expense-btn');
    const itemNameInput = document.getElementById('item-name');
    const itemAmountInput = document.getElementById('item-amount');

    // 🚀 --- 완벽한 타임존(Timezone) 날짜 처리 함수들 ---
    const formatNumber = (num, decimals = 2) => isNaN(num) ? '0' : num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const parseFormattedNumber = (str) => parseFloat(String(str).replace(/,/g, '')) || 0;
    
    // 로컬 시간 기준 YYYY-MM-DD 반환 (정산 생성용)
    function getLocalDateString() {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        return new Date(now.getTime() - offset).toISOString().split('T')[0];
    }

    // 로컬 시간 기준 YYYY-MM-DDTHH:mm 반환 (지출 추가용)
    function getLocalISOString() {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        return new Date(now.getTime() - offset).toISOString().slice(0, 16);
    }

    // DB에서 가져온 날짜(UTC)를 로컬 날짜(YYYY-MM-DD)로 강제 보정하여 화면에 표시
    function formatDisplayDate(dateStr) {
        if (!dateStr) return '';
        if (dateStr.includes('T')) {
            const d = new Date(dateStr);
            const offset = d.getTimezoneOffset() * 60000;
            return new Date(d.getTime() - offset).toISOString().split('T')[0];
        }
        return dateStr;
    }

    // --- UI/UX Enhancements (Toast, Confirm, Loader) ---
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconClass = 'fa-check-circle';
        if (type === 'error') iconClass = 'fa-exclamation-circle';
        if (type === 'info') iconClass = 'fa-info-circle';

        toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function showConfirm(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-confirm-modal');
            const messageEl = document.getElementById('confirm-message');
            const confirmBtn = document.getElementById('confirm-yes-btn');
            const cancelBtn = document.getElementById('confirm-no-btn');

            messageEl.textContent = message;
            modal.classList.remove('hidden');

            const cleanup = () => {
                modal.classList.add('hidden');
                confirmBtn.removeEventListener('click', handleYes);
                cancelBtn.removeEventListener('click', handleNo);
            };

            const handleYes = () => { cleanup(); resolve(true); };
            const handleNo = () => { cleanup(); resolve(false); };

            confirmBtn.addEventListener('click', handleYes);
            cancelBtn.addEventListener('click', handleNo);
        });
    }

    function setLoading(isLoading) {
        const loader = document.getElementById('global-loader');
        if (isLoading) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }

    // UI 업데이트: 로그인 상태에 따라 버튼과 계정 표시 제어
    function updateAuthUI() {
        if (currentUser) {
            authBtn.innerHTML = `<i class="fas fa-sign-out-alt" style="color: var(--danger);"></i> <span data-i18n="logout" style="color: var(--danger);">${locales[currentLang]?.logout || '로그아웃'}</span>`;
            authBtn.style.background = '#fee2e2';
            authBtn.style.borderColor = 'transparent';
            addSettlementFab.classList.remove('hidden'); 
            
            if (userInfoDisplay && userEmailText) {
                userEmailText.textContent = currentUser.email;
                userInfoDisplay.classList.remove('hidden');
            }
        } else {
            authBtn.innerHTML = `<i class="fas fa-sign-in-alt"></i> <span data-i18n="login">${locales[currentLang]?.login || '로그인'}</span>`;
            authBtn.style.background = 'transparent';
            authBtn.style.borderColor = 'var(--border)';
            addSettlementFab.classList.add('hidden'); 
            
            if (userInfoDisplay) userInfoDisplay.classList.add('hidden');
        }
    }

    async function handleAuthClick() {
        if (currentUser) {
            setLoading(true);
            await supabaseClient.auth.signOut();
            window.location.replace('login.html');
        } else {
            window.location.href = 'login.html';
        }
    }

    function updateUI(lang) {
        currentLang = lang;
        const translations = locales[lang];
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[key]) el.innerHTML = translations[key];
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
             if (translations[key]) el.placeholder = translations[key];
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
             if (translations[key]) el.title = translations[key];
        });
        
        document.querySelectorAll('[data-i18n-options]').forEach(el => {
            const keys = el.getAttribute('data-i18n-options').split(',');
            el.innerHTML = '';
            keys.forEach(key => {
                const option = document.createElement('option');
                const value = key.trim();
                if (value === 'splitEqually') option.value = 'equal';
                else if (value === 'splitByAmount') option.value = 'amount';
                option.textContent = translations[value];
                el.appendChild(option);
            });
        });
        
        updateAuthUI();

        if (currentSettlement) {
            updateParticipantNames(currentSettlement.participants);
            render();
        }
        renderSettlementList();
    }

    function setLanguage(lang) {
        localStorage.setItem('preferredLang', lang);
        languageSwitcher.value = lang;
        updateUI(lang);
    }

    async function getExchangeRate(date, base, target) {
        if (base === target) return 1;
        const cacheKey = `${date}_${base}_${target}`;
        if (exchangeRatesCache[cacheKey]) return exchangeRatesCache[cacheKey];
        const requestDate = new Date(date) > new Date() ? 'latest' : date;

        try {
            const response = await fetch(`https://api.frankfurter.app/${requestDate}?from=${base}&to=${target}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            const rate = data.rates[target];
            if(!rate) throw new Error(`Rate not found for ${target}`);
            exchangeRatesCache[cacheKey] = rate;
            return rate;
        } catch (error) { 
            showToast('환율 정보를 가져오는데 실패했습니다.', 'error');
            return null; 
        }
    }

    async function initialize() {
        const preferredLang = localStorage.getItem('preferredLang');
        const browserLang = navigator.language.split('-')[0];
        const initialLang = preferredLang || (['ko', 'en', 'ja'].includes(browserLang) ? browserLang : 'en');
        
        setupEventListeners();

        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (!session) {
            window.location.replace('login.html');
            return; 
        }
        
        currentUser = session.user;
        updateAuthUI();

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' || !session) {
                window.location.replace('login.html');
            } else {
                currentUser = session.user;
                updateAuthUI();
            }
        });

        setLanguage(initialLang);
        itemDateInput.value = getLocalISOString();
        
        setLoading(true);
        await loadData();
        setLoading(false);
    }

    async function loadData() {
        const { data, error } = await supabaseClient.from('settlements').select(`* , expenses (*)`).order('date', { ascending: false }).order('created_at', { ascending: false });
        if (error) { showToast('데이터를 불러오는데 실패했습니다.', 'error'); return; }
        settlements = data || [];
        renderSettlementList();
    }

    function renderParticipantInputs(initialCount = 2) {
        participantListContainer.innerHTML = '';
        for (let i = 0; i < initialCount; i++) {
            addParticipantInputUI();
        }
        updateRemoveButtons();
    }

    function addParticipantInputUI(value = '') {
        const div = document.createElement('div');
        div.className = 'participant-input-group';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'participant-name-input';
        
        const placeholderTemplate = locales[currentLang]?.participantPlaceholder || `참가자 이름 (예: 친구 {n})`;
        input.placeholder = placeholderTemplate.replace('{n}', participantListContainer.children.length + 1);
        
        input.value = value;
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-participant-btn';
        removeBtn.innerHTML = '<i class="fas fa-minus"></i>';
        removeBtn.onclick = () => {
            div.remove();
            updateRemoveButtons();
        };

        div.appendChild(input);
        div.appendChild(removeBtn);
        participantListContainer.appendChild(div);
        updateRemoveButtons();
    }

    function updateRemoveButtons() {
        const btns = participantListContainer.querySelectorAll('.remove-participant-btn');
        if (btns.length <= 2) {
            btns.forEach(btn => btn.disabled = true);
        } else {
            btns.forEach(btn => btn.disabled = false);
        }
    }

    function getParticipantNamesFromModal() {
        const inputs = participantListContainer.querySelectorAll('.participant-name-input');
        const names = Array.from(inputs).map(input => input.value.trim()).filter(val => val !== '');
        return names.length >= 2 ? names : ['A', 'B']; 
    }

    async function fetchAndSetRate(fetchType, currencyFrom, currencyTo, inputEl, previewUpdater) {
        if (!currentSettlement) return;
        setLoading(true);
        const fetchDate = fetchType === 'latest' ? 'latest' : currentSettlement.date;
        const rate = await getExchangeRate(fetchDate, currencyFrom, currencyTo);
        if (rate !== null) {
            inputEl.value = rate.toFixed(4);
            previewUpdater();
        }
        setLoading(false);
    }

    async function handleAddCurrencyChange() {
        if (!currentSettlement) return;
        const currency = itemCurrencySelect.value;
        const base = currentSettlement.base_currency;
        const wrapper = document.getElementById('add-rate-config-wrapper');

        if (currency === base) { wrapper.classList.add('hidden'); return; }
        wrapper.classList.remove('hidden');
        document.getElementById('add-currency-from').textContent = currency;
        document.getElementById('add-currency-to').textContent = base;

        if (!document.getElementById('add-custom-rate').value) { 
            await fetchAndSetRate('settlement', currency, base, document.getElementById('add-custom-rate'), updateAddPreview);
        } else { updateAddPreview(); }
    }

    function updateAddPreview() {
        const amount = parseFormattedNumber(itemAmountInput.value);
        const rate = parseFloat(document.getElementById('add-custom-rate').value) || 0;
        const base = currentSettlement ? currentSettlement.base_currency : '';
        document.getElementById('add-converted-total').textContent = `${formatNumber(amount * rate, 2)} ${base}`;
    }

    async function handleEditCurrencyChange() {
        if (!currentSettlement) return;
        const currency = editItemCurrencySelect.value;
        const base = currentSettlement.base_currency;
        const wrapper = document.getElementById('edit-rate-config-wrapper');

        if (currency === base) { wrapper.classList.add('hidden'); return; }
        wrapper.classList.remove('hidden');
        document.getElementById('edit-currency-from').textContent = currency;
        document.getElementById('edit-currency-to').textContent = base;

        if (!document.getElementById('edit-custom-rate').value) { 
            await fetchAndSetRate('settlement', currency, base, document.getElementById('edit-custom-rate'), updateEditPreview);
        } else { updateEditPreview(); }
    }

    function updateEditPreview() {
        const amount = parseFormattedNumber(editItemAmountInput.value);
        const rate = parseFloat(document.getElementById('edit-custom-rate').value) || 0;
        const base = currentSettlement ? currentSettlement.base_currency : '';
        document.getElementById('edit-converted-total').textContent = `${formatNumber(amount * rate, 2)} ${base}`;
    }

    async function copySummaryText() {
        if (!currentSettlement) return;
        const { title, base_currency, expenses, participants } = currentSettlement;
        
        const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        const transfers = calculateMinimumTransfers(expenses, participants);

        const copyTexts = {
            ko: { summary: "정산 요약", total: "총 지출", result: "정산 결과", sendFormat: (from, to, amount, currency) => `${from} ➡️ ${to}에게 ${amount} ${currency} 송금 부탁할게! 💸`, notice: "상세 내역 확인하기: " },
            en: { summary: "Settlement Summary", total: "Total Expense", result: "Settlement Result", sendFormat: (from, to, amount, currency) => `${from} ➡️ ${to}: Please send ${amount} ${currency}! 💸`, notice: "Check details at: " },
            ja: { summary: "精算の概要", total: "総支出", result: "精算結果", sendFormat: (from, to, amount, currency) => `${from} ➡️ ${to}へ ${amount} ${currency} の送金をお願い！ 💸`, notice: "詳細を確認する: " }
        };

        const t = copyTexts[currentLang] || copyTexts['ko'];
        let resultString = '';
        
        if (transfers.length === 0) {
            resultString = locales[currentLang]?.settlementDone || 'Settlement complete (No transfers needed)';
        } else {
            resultString = transfers.map(tr => t.sendFormat(tr.from, tr.to, formatNumber(tr.amount, 0), base_currency)).join('\n');
        }

        const link = "https://skim72.github.io/dutch_pay/";
        const text = `🧾 [${title}] ${t.summary}\n\n💰 ${t.total}: ${formatNumber(totalAmount, 0)} ${base_currency}\n🔔 ${t.result}:\n${resultString}\n\n${t.notice}${link}`;
        
        try {
            await navigator.clipboard.writeText(text);
            showToast(locales[currentLang]?.copySuccess || "Copied!", 'success');
        } catch (err) {
            showToast('복사에 실패했습니다.', 'error');
        }
    }

    async function saveAsImage() {
        if (!currentSettlement) return;
        setLoading(true);
        const targetView = document.getElementById('calculator');
        const rightPane = document.getElementById('right-pane');
        
        const oldOverflow = rightPane.style.overflowY;
        rightPane.style.overflowY = 'visible';

        targetView.classList.add('capture-mode');
        await new Promise(resolve => setTimeout(resolve, 300));

        try {
            const dataUrl = await htmlToImage.toPng(targetView, { 
                backgroundColor: '#ffffff', 
                pixelRatio: window.devicePixelRatio > 1 ? window.devicePixelRatio + 1 : 3,
                width: targetView.scrollWidth,
                height: targetView.scrollHeight
            });

            const now = new Date();
            const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

            const link = document.createElement('a');
            link.download = `SettleUp_${currentSettlement.title}_${timestamp}.png`;
            link.href = dataUrl;
            link.click();
            showToast('이미지가 성공적으로 저장되었습니다!', 'success');
        } catch(err) {
            showToast("이미지 저장에 실패했습니다.", 'error');
        } finally {
            targetView.classList.remove('capture-mode');
            rightPane.style.overflowY = oldOverflow;
            setLoading(false);
        }
    }

    function setupEventListeners() {
        languageSwitcher.addEventListener('change', (e) => setLanguage(e.target.value));
        appTitle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
        mobileMenuBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
        
        if(authBtn) authBtn.addEventListener('click', handleAuthClick); 

        addSettlementFab.addEventListener('click', () => {
            // 🚀 완벽한 로컬 날짜(오늘) 가져오기 적용
            newSettlementDateInput.value = getLocalDateString();
            renderParticipantInputs(2);
            addSettlementModal.classList.remove('hidden');
            newSettlementTitleInput.focus();
        });

        addParticipantBtn.addEventListener('click', () => addParticipantInputUI());
        
        [addSettlementModal, exchangeRateModal, editExpenseModal, expenseRateModal].forEach(modal => {
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
            modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
        });

        createSettlementBtn.addEventListener('click', createSettlement);
        addExpenseBtn.addEventListener('click', addExpense);
        saveExpenseChangesBtn.addEventListener('click', handleSaveExpenseChanges);
        exchangeRateInfoBtn.addEventListener('click', showExchangeRateModal);

        copyTextBtn.addEventListener('click', copySummaryText);
        saveImageBtn.addEventListener('click', saveAsImage);

        itemCurrencySelect.addEventListener('change', () => {
            document.getElementById('add-custom-rate').value = ''; 
            handleAddCurrencyChange();
        });
        itemAmountInput.addEventListener('input', () => {
            handleAmountInput(itemAmountInput);
            updateAddPreview();
        });
        document.getElementById('add-custom-rate').addEventListener('input', updateAddPreview);
        document.getElementById('add-settlement-rate-btn').addEventListener('click', () => {
            fetchAndSetRate('settlement', itemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('add-custom-rate'), updateAddPreview);
        });
        document.getElementById('add-live-rate-btn').addEventListener('click', () => {
            fetchAndSetRate('latest', itemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('add-custom-rate'), updateAddPreview);
        });

        editItemCurrencySelect.addEventListener('change', () => {
            document.getElementById('edit-custom-rate').value = ''; 
            handleEditCurrencyChange();
        });
        editItemAmountInput.addEventListener('input', () => {
            handleAmountInput(editItemAmountInput);
            updateEditPreview();
        });
        document.getElementById('edit-custom-rate').addEventListener('input', updateEditPreview);
        document.getElementById('edit-settlement-rate-btn').addEventListener('click', () => {
            fetchAndSetRate('settlement', editItemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('edit-custom-rate'), updateEditPreview);
        });
        document.getElementById('edit-live-rate-btn').addEventListener('click', () => {
            fetchAndSetRate('latest', editItemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('edit-custom-rate'), updateEditPreview);
        });

        completeSettlementBtn.addEventListener('click', async () => {
            if (currentSettlement) {
                setLoading(true);
                currentSettlement.is_settled = !currentSettlement.is_settled;
                const { error } = await supabaseClient.from('settlements').update({ is_settled: currentSettlement.is_settled }).eq('id', currentSettlement.id);
                if (error) {
                    showToast('상태 업데이트 실패', 'error');
                } else {
                    showToast(currentSettlement.is_settled ? '정산이 완료되었습니다.' : '정산이 다시 열렸습니다.', 'info');
                }
                render(); 
                renderSettlementList(); 
                setLoading(false);
            }
        });
        
        splitMethodSelect.addEventListener('change', () => handleSplitMethodChange(splitMethodSelect, itemAmountInput, splitAmountInputs));
        editSplitMethodSelect.addEventListener('change', () => handleSplitMethodChange(editSplitMethodSelect, editItemAmountInput, editSplitAmountInputs));

        downloadExcelBtn.addEventListener('click', downloadExcel);
    }

    function handleAmountInput(inputEl) {
        const value = inputEl.value;
        const hasDecimal = value.includes('.');
        let numericValue = parseFormattedNumber(value);
        if (hasDecimal) {
            const parts = value.split('.');
            inputEl.value = formatNumber(parseFloat(parts[0]), 0) + '.' + (parts[1] || '');
        } else { inputEl.value = formatNumber(numericValue, 0); }
    }

    function attachDynamicSplitInputListeners(container, totalAmountInput, previewUpdater) {
        const inputs = container.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                handleAmountInput(e.target);
                let sum = 0;
                inputs.forEach(inp => sum += parseFormattedNumber(inp.value));
                totalAmountInput.value = formatNumber(sum, 0);
                if(previewUpdater) previewUpdater();
            });
        });
    }

    function handleSplitMethodChange(selectEl, amountEl, splitInputsEl) {
        const isManualAmount = selectEl.value === 'amount';
        splitInputsEl.classList.toggle('hidden', !isManualAmount);
        amountEl.readOnly = isManualAmount;
        if (isManualAmount) {
            let sum = 0;
            splitInputsEl.querySelectorAll('input').forEach(inp => sum += parseFormattedNumber(inp.value));
            amountEl.value = formatNumber(sum, 0);
        } else {
            amountEl.value = amountEl.dataset.originalValue || '';
        }
        if (selectEl === splitMethodSelect) updateAddPreview();
        else updateEditPreview();
    }

    async function createSettlement() {
        const title = newSettlementTitleInput.value.trim();
        const date = newSettlementDateInput.value;
        const participants = getParticipantNamesFromModal();
        const baseCurrency = baseCurrencySelect.value;
        
        if (!title || !date || participants.length < 2) {
             showToast("참가자는 최소 2명 이상이어야 하며 제목을 입력해야 합니다.", "error"); 
             return;
        }

        setLoading(true);
        const { data, error } = await supabaseClient.from('settlements')
            .insert([{ title, date, participants: participants, base_currency: baseCurrency, is_settled: false }]).select('*, expenses (*)');

        setLoading(false);

        if (error) { showToast('정산 생성에 실패했습니다.', 'error'); return; }
        
        showToast('새로운 정산이 생성되었습니다.', 'success');
        const newSettlement = data[0];
        settlements.push(newSettlement);
        settlements.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        renderSettlementList(); 
        selectSettlement(newSettlement);
        addSettlementModal.classList.add('hidden');
        newSettlementTitleInput.value = ''; 
    }
    
    async function deleteSettlement(settlementId) {
        if (await showConfirm(locales[currentLang]?.deleteSettlementConfirm)) {
            setLoading(true);
            await supabaseClient.from('expenses').delete().eq('settlement_id', settlementId);
            const { error: settlementError } = await supabaseClient.from('settlements').delete().eq('id', settlementId);
            setLoading(false);

            if (settlementError) { showToast('삭제에 실패했습니다.', 'error'); return; }
            
            showToast('성공적으로 삭제되었습니다.', 'success');
            settlements = settlements.filter(s => s.id !== settlementId);
            if (currentSettlement && currentSettlement.id === settlementId) {
                currentSettlement = null; calculatorView.classList.add('hidden'); placeholderRightPane.classList.remove('hidden');
            }
            renderSettlementList();
        }
    }

    function renderSettlementList() {
        if (!currentUser) return; 
        
        settlementListContainer.innerHTML = settlements.length === 0 
            ? `<p class="subtitle">${locales[currentLang]?.noHistory || 'History does not exist.'}</p>`
            : settlements.map(s => `
                <div class="settlement-item-wrapper">
                    <button class="settlement-item ${s.is_settled ? 'is-settled' : ''}" data-id="${s.id}">
                        <div class="item-content">
                            <div class="item-text-group">
                                <div class="date-row">
                                    ${s.is_settled ? '<i class="fas fa-check-circle settled-icon"></i>' : ''}
                                    <span class="item-date-badge"><i class="far fa-calendar-alt"></i> ${formatDisplayDate(s.date)}</span>
                                </div>
                                <span class="item-title">${s.title}</span>
                                <span class="item-participants">(${(s.participants || []).join(', ')}) - ${s.base_currency}</span>
                            </div>
                        </div>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <button class="delete-settlement-btn" data-id="${s.id}"><i class="fas fa-trash-alt"></i></button>
                </div>`).join('');
        
        document.querySelectorAll('.settlement-item').forEach(btn => {
            const settlementId = parseInt(btn.dataset.id);
            const settlement = settlements.find(s => s.id === settlementId);
            if(settlement) btn.addEventListener('click', () => selectSettlement(settlement));
        });

        document.querySelectorAll('.delete-settlement-btn').forEach(btn => btn.addEventListener('click', (e) => {
            e.stopPropagation(); deleteSettlement(parseInt(e.currentTarget.dataset.id))
        }));
        
        if(currentSettlement) {
            const currentItem = document.querySelector(`.settlement-item[data-id='${currentSettlement.id}']`);
            if (currentItem) currentItem.classList.add('active');
        }
    }

    function selectSettlement(settlement) {
        currentSettlement = settlement;
        placeholderRightPane.classList.add('hidden');
        calculatorView.classList.remove('hidden');
        settlementDisplay.textContent = settlement.title;
        itemCurrencySelect.value = settlement.base_currency;
        document.getElementById('add-rate-config-wrapper').classList.add('hidden'); 
        
        updateParticipantNames(settlement.participants);
        renderTableHeader(settlement.participants);

        document.querySelectorAll('.settlement-item').forEach(item => item.classList.toggle('active', item.dataset.id == settlement.id));
        if (window.innerWidth <= 768) sidebar.classList.add('collapsed');
        
        itemDateInput.value = getLocalISOString();
        render();
    }

    function renderTableHeader(participants) {
        const children = Array.from(expenseTableHeaderRow.children);
        while (expenseTableHeaderRow.children.length > 3) {
            expenseTableHeaderRow.removeChild(expenseTableHeaderRow.lastChild);
        }

        const shareOfString = locales[currentLang]?.shareOf || "{name}님 분담액";

        participants.forEach(p => {
            const th = document.createElement('th');
            th.textContent = shareOfString.replace('{name}', p);
            expenseTableHeaderRow.appendChild(th);
        });

        const actionTh = document.createElement('th');
        actionTh.setAttribute('data-i18n', 'tableHeaderActions');
        actionTh.textContent = locales[currentLang]?.tableHeaderActions || '관리';
        expenseTableHeaderRow.appendChild(actionTh);
    }

    function updateParticipantNames(participants) {
        const paidByString = locales[currentLang]?.paidBy || 'Paid by {payer}';
        const shareOfString = locales[currentLang]?.shareOf || "{name}님 분담액";

        [itemPayerSelect, editItemPayerSelect].forEach(select => {
            select.innerHTML = participants.map(p => `<option value="${p}">${paidByString.replace('{payer}', p)}</option>`).join('');
        });

        splitAmountInputs.innerHTML = '';
        editSplitAmountInputs.innerHTML = '';

        participants.forEach(p => {
            const addDiv = document.createElement('div');
            addDiv.className = 'dynamic-split-item';
            addDiv.innerHTML = `<label>${p}</label><input type="text" data-participant="${p}" placeholder="${shareOfString.replace('{name}', p)}" inputmode="decimal">`;
            splitAmountInputs.appendChild(addDiv);

            const editDiv = document.createElement('div');
            editDiv.className = 'dynamic-split-item';
            editDiv.innerHTML = `<label>${p}</label><input type="text" data-participant="${p}" inputmode="decimal">`;
            editSplitAmountInputs.appendChild(editDiv);
        });

        attachDynamicSplitInputListeners(splitAmountInputs, itemAmountInput, updateAddPreview);
        attachDynamicSplitInputListeners(editSplitAmountInputs, editItemAmountInput, updateEditPreview);
    }

    async function addExpense() {
        if (!currentSettlement) return;
        const name = itemNameInput.value.trim();
        const originalAmount = parseFormattedNumber(itemAmountInput.value);
        const currency = itemCurrencySelect.value;
        const expenseDateRaw = itemDateInput.value; 
        
        if (!name || originalAmount <= 0 || !expenseDateRaw) { showToast(locales[currentLang]?.invalidInput, "error"); return; }

        const expenseDate = new Date(expenseDateRaw).toISOString();

        let rate = 1;
        if (currency !== currentSettlement.base_currency) {
            rate = parseFloat(document.getElementById('add-custom-rate').value);
            if (!rate || rate <= 0) { showToast(locales[currentLang]?.invalidInput, "error"); return; }
        }

        const convertedAmount = originalAmount * rate;
        const participants = currentSettlement.participants;
        const payer = itemPayerSelect.value;
        const splitMethod = splitMethodSelect.value;
        let shares = {};

        if (splitMethod === 'equal') {
            const equalShare = convertedAmount / participants.length;
            participants.forEach(p => shares[p] = equalShare);
        } else if (splitMethod === 'amount') {
            let sumCheck = 0;
            const inputs = splitAmountInputs.querySelectorAll('input');
            inputs.forEach(inp => {
                const p = inp.dataset.participant;
                const pAmount = parseFormattedNumber(inp.value);
                sumCheck += pAmount;
                shares[p] = pAmount * rate;
            });
            if (Math.abs(sumCheck - originalAmount) > 0.01) { showToast(locales[currentLang]?.amountMismatch, "error"); return; }
        }

        setLoading(true);
        const { data, error } = await supabaseClient.from('expenses')
            .insert([{ 
                settlement_id: currentSettlement.id, expense_date: expenseDate,
                name, original_amount: originalAmount, currency, amount: convertedAmount, payer, split: splitMethod, shares 
            }]).select();

        setLoading(false);

        if (error) { showToast('기록에 실패했습니다.', 'error'); return; }
        
        showToast('지출이 기록되었습니다.', 'success');
        currentSettlement.expenses.push(data[0]);

        if (currentSettlement.is_settled) {
            currentSettlement.is_settled = false;
            await supabaseClient.from('settlements').update({ is_settled: false }).eq('id', currentSettlement.id);
        }
        
        render(); 
        renderSettlementList(); 
        clearInputs();
    }

    function openEditExpenseModal(expenseId) {
        const expense = currentSettlement.expenses.find(e => e.id === expenseId);
        if (!expense) return;

        currentEditingExpenseId = expenseId;

        editExpenseIdInput.value = expense.id;
        editItemNameInput.value = expense.name;
        editItemAmountInput.value = formatNumber(expense.original_amount, 0);
        editItemAmountInput.dataset.originalValue = formatNumber(expense.original_amount, 0);
        
        if (expense.expense_date) {
            const d = new Date(expense.expense_date);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            editItemDateInput.value = d.toISOString().slice(0, 16);
        } else {
            editItemDateInput.value = getLocalISOString();
        }
        
        editItemCurrencySelect.innerHTML = SUPPORTED_CURRENCIES.map(c => `<option value="${c}" ${c === expense.currency ? 'selected' : ''}>${c}</option>`).join('');
        editItemPayerSelect.value = expense.payer;
        editSplitMethodSelect.value = expense.split;

        const rate = (expense.currency !== currentSettlement.base_currency) ? (expense.amount / expense.original_amount) : 1;

        if (expense.currency !== currentSettlement.base_currency) {
            document.getElementById('edit-custom-rate').value = rate.toFixed(4);
            handleEditCurrencyChange(); 
        } else {
            document.getElementById('edit-rate-config-wrapper').classList.add('hidden');
        }

        if (expense.split === 'amount') {
            const inputs = editSplitAmountInputs.querySelectorAll('input');
            inputs.forEach(inp => {
                const p = inp.dataset.participant;
                const originalShare = (expense.shares[p] || 0) / rate;
                inp.value = formatNumber(originalShare, 0);
            });
        } else {
            editSplitAmountInputs.querySelectorAll('input').forEach(inp => inp.value = '');
        }

        handleSplitMethodChange(editSplitMethodSelect, editItemAmountInput, editSplitAmountInputs);
        editExpenseModal.classList.remove('hidden');
    }

    async function handleSaveExpenseChanges() {
        if (!currentSettlement || currentEditingExpenseId === null) return;

        const name = editItemNameInput.value.trim();
        const originalAmount = parseFormattedNumber(editItemAmountInput.value);
        const currency = editItemCurrencySelect.value;
        const expenseDateRaw = editItemDateInput.value; 
        
        if (!name || originalAmount <= 0 || !expenseDateRaw) { showToast(locales[currentLang]?.invalidInput, 'error'); return; }

        const expenseDate = new Date(expenseDateRaw).toISOString();

        let rate = 1;
        if (currency !== currentSettlement.base_currency) {
            rate = parseFloat(document.getElementById('edit-custom-rate').value);
            if (!rate || rate <= 0) { showToast(locales[currentLang]?.invalidInput, 'error'); return; }
        }

        const convertedAmount = originalAmount * rate;
        const participants = currentSettlement.participants;
        const payer = editItemPayerSelect.value;
        const splitMethod = editSplitMethodSelect.value;
        let shares = {};

        if (splitMethod === 'equal') {
            const equalShare = convertedAmount / participants.length;
            participants.forEach(p => shares[p] = equalShare);
        } else if (splitMethod === 'amount') {
            let sumCheck = 0;
            const inputs = editSplitAmountInputs.querySelectorAll('input');
            inputs.forEach(inp => {
                const p = inp.dataset.participant;
                const pAmount = parseFormattedNumber(inp.value);
                sumCheck += pAmount;
                shares[p] = pAmount * rate;
            });
            if (Math.abs(sumCheck - originalAmount) > 0.01) { showToast(locales[currentLang]?.amountMismatch, 'error'); return; }
        }
        
        setLoading(true);
        const { data, error } = await supabaseClient.from('expenses')
            .update({ 
                expense_date: expenseDate,
                name, original_amount: originalAmount, currency, amount: convertedAmount, payer, split: splitMethod, shares 
            })
            .eq('id', currentEditingExpenseId).select();

        setLoading(false);

        if (error) { showToast('저장에 실패했습니다.', 'error'); return; }
        
        showToast('성공적으로 수정되었습니다.', 'success');
        const expenseIndex = currentSettlement.expenses.findIndex(e => e.id === currentEditingExpenseId);
        if (expenseIndex > -1) currentSettlement.expenses[expenseIndex] = data[0];

        if (currentSettlement.is_settled) {
            currentSettlement.is_settled = false;
            await supabaseClient.from('settlements').update({ is_settled: false }).eq('id', currentSettlement.id);
        }

        render(); 
        renderSettlementList(); 
        editExpenseModal.classList.add('hidden'); currentEditingExpenseId = null;
    }
    
    async function deleteExpense(expenseId) {
        if (await showConfirm(locales[currentLang]?.deleteConfirm)) {
            setLoading(true);
            const { error } = await supabaseClient.from('expenses').delete().eq('id', expenseId);
            setLoading(false);

            if (error) { showToast('삭제에 실패했습니다.', 'error'); return; }
            
            showToast('삭제되었습니다.', 'success');
            currentSettlement.expenses = currentSettlement.expenses.filter(exp => exp.id !== expenseId);
            if (currentSettlement.is_settled) {
                currentSettlement.is_settled = false;
                await supabaseClient.from('settlements').update({ is_settled: false }).eq('id', currentSettlement.id);
            }
            render(); 
            renderSettlementList(); 
        }
    }

    function showExpenseExchangeRate(expenseId) {
        if (!currentSettlement) return;
        const expense = currentSettlement.expenses.find(e => e.id === expenseId);
        if (!expense) return;

        const appliedRate = expense.amount / expense.original_amount;

        document.getElementById('calc-foreign-currency').textContent = expense.currency;
        document.getElementById('calc-base-currency').textContent = currentSettlement.base_currency;
        document.getElementById('calc-base-amount').textContent = formatNumber(appliedRate, 4);

        document.getElementById('calc-total-foreign').textContent = `${formatNumber(expense.original_amount, 2)} ${expense.currency}`;
        document.getElementById('calc-total-base').textContent = `${formatNumber(expense.amount, 2)} ${currentSettlement.base_currency}`;

        expenseRateModal.classList.remove('hidden');
    }

    async function showExchangeRateModal() {
        if (!currentSettlement) return;
        const { date, base_currency } = currentSettlement;
        
        const formattedDate = formatDisplayDate(date); // 🚀 보정된 날짜 사용
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const settlementDate = new Date(formattedDate);
        const isFuture = settlementDate > today;
        
        exchangeRateDate.textContent = `${formattedDate} ${locales[currentLang].baseDate}`;
        if (isFuture) {
            let futureNotice = "미래 날짜이므로 현재(최신) 환율이 적용되었습니다.";
            if (currentLang === 'en') futureNotice = "Future date: using current latest rates.";
            if (currentLang === 'ja') futureNotice = "未来の日付のため、現在の最新レートが適用されています。";
            
            exchangeRateDate.innerHTML += `<br><span style="color: var(--danger); font-size: 0.85rem; display: inline-block; margin-top: 0.5rem;"><i class="fas fa-exclamation-triangle"></i> ${futureNotice}</span>`;
        }

        setLoading(true);
        let ratesInfoHTML = `<div class="rate-item"><span class="base">1 ${base_currency}</span> =</div>`;
        const targetCurrencies = SUPPORTED_CURRENCIES.filter(c => c !== base_currency);

        for (const target of targetCurrencies) {
            const rate = await getExchangeRate(date, base_currency, target);
            if (rate !== null) ratesInfoHTML += `<div class="rate-item"><span>${formatNumber(rate, 4)}</span><span>${target}</span></div>`;
        }
        setLoading(false);

        exchangeRateInfo.innerHTML = ratesInfoHTML;
        exchangeRateModal.classList.remove('hidden');
    }

    function render() { 
        if (currentSettlement) { 
            currentSettlement.expenses.sort((a, b) => new Date(a.expense_date || a.created_at) - new Date(b.expense_date || b.created_at));
            renderExpenses(); updateSummary(); toggleExpenseForm(currentSettlement.is_settled);
        }
    }

    function renderExpenses() {
        expenseTableBody.innerHTML = '';
        if (!currentSettlement || !currentSettlement.expenses) return;
        const participants = currentSettlement.participants;
        const isLocked = currentSettlement.is_settled;

        currentSettlement.expenses.forEach(exp => {
            const row = expenseTableBody.insertRow();
            row.dataset.id = exp.id;
            row.classList.toggle('is-settled', isLocked);

            let dateHtml = '';
            if (exp.expense_date) {
                const d = new Date(exp.expense_date);
                let localeCode = currentLang === 'en' ? 'en-US' : (currentLang === 'ja' ? 'ja-JP' : 'ko-KR');
                const dateStr = d.toLocaleDateString(localeCode, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                dateHtml = `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">${dateStr}</div>`;
            }

            let amountHtml = `${formatNumber(exp.original_amount, 2)} ${exp.currency}`;
            if (exp.currency !== currentSettlement.base_currency) {
                amountHtml = `<span class="clickable-amount" data-id="${exp.id}" title="적용 환율 보기"><i class="fas fa-info-circle"></i> ${amountHtml}</span>`;
            }

            let htmlStr = `
                <td>${dateHtml}<div>${exp.name}</div></td>
                <td>${amountHtml}</td>
                <td>${exp.payer}</td>
            `;

            participants.forEach(p => {
                htmlStr += `<td>${formatNumber(exp.shares[p] || 0, 2)} ${currentSettlement.base_currency}</td>`;
            });

            htmlStr += `<td><button class="delete-expense-btn" data-id="${exp.id}"><i class="fas fa-trash-alt"></i></button></td>`;
            
            row.innerHTML = htmlStr;
            
            const clickableAmountSpan = row.querySelector('.clickable-amount');
            if (clickableAmountSpan) {
                clickableAmountSpan.addEventListener('click', (e) => {
                    e.stopPropagation(); showExpenseExchangeRate(exp.id);
                });
            }

            if (!isLocked) {
                row.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-expense-btn') || e.target.closest('.clickable-amount')) return;
                    openEditExpenseModal(exp.id);
                });
            }
        });

        expenseTableBody.querySelectorAll('.delete-expense-btn').forEach(btn => 
            btn.addEventListener('click', (e) => { e.stopPropagation(); deleteExpense(parseInt(e.currentTarget.dataset.id)) })
        );
    }
    
    function calculateMinimumTransfers(expenses, participants) {
        const balances = {};
        participants.forEach(p => balances[p] = 0);
        
        expenses.forEach(exp => {
            balances[exp.payer] += (exp.amount || 0);
            participants.forEach(p => {
                balances[p] -= (exp.shares[p] || 0);
            });
        });

        let debtors = []; 
        let creditors = []; 

        for (const [person, balance] of Object.entries(balances)) {
            if (balance > 0.01) creditors.push({ person, amount: balance });
            else if (balance < -0.01) debtors.push({ person, amount: Math.abs(balance) });
        }

        debtors.sort((a, b) => b.amount - a.amount);
        creditors.sort((a, b) => b.amount - a.amount);

        const transfers = [];
        let i = 0; 
        let j = 0; 

        while (i < debtors.length && j < creditors.length) {
            let debtor = debtors[i];
            let creditor = creditors[j];

            let amountToTransfer = Math.min(debtor.amount, creditor.amount);

            transfers.push({
                from: debtor.person,
                to: creditor.person,
                amount: amountToTransfer
            });

            debtor.amount -= amountToTransfer;
            creditor.amount -= amountToTransfer;

            if (debtor.amount < 0.01) i++;
            if (creditor.amount < 0.01) j++;
        }

        return transfers;
    }

    function updateSummary() {
        if (!currentSettlement) return;
        const { expenses, participants, base_currency, is_settled } = currentSettlement;
        const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        totalExpenseP.textContent = `${locales[currentLang]?.totalExpense || 'Total Expense'}: ${formatNumber(totalAmount, 2)} ${base_currency}`;

        finalSettlementContainer.innerHTML = '';
        completeSettlementBtn.classList.add('hidden');

        if (is_settled) {
            const transfers = calculateMinimumTransfers(expenses, participants);
            
            if (transfers.length === 0) {
                finalSettlementContainer.innerHTML = `<div class="transfer-item">${locales[currentLang]?.settlementDone || 'Settlement complete'}</div>`;
            } else {
                transfers.forEach(tr => {
                    const div = document.createElement('div');
                    div.className = 'transfer-item';
                    div.textContent = `${tr.from} ➡️ ${tr.to} (${formatNumber(tr.amount, 2)} ${base_currency})`;
                    finalSettlementContainer.appendChild(div);
                });
            }

            completeSettlementBtn.textContent = locales[currentLang]?.editSettlement || 'Reopen Settlement';
            completeSettlementBtn.classList.add('edit-mode'); completeSettlementBtn.classList.remove('hidden');
        } else {
            finalSettlementContainer.innerHTML = `<div class="transfer-item text-muted">${locales[currentLang]?.settlementInProgress || 'Settlement in progress...'}</div>`;
            if (expenses.length > 0) {
                completeSettlementBtn.textContent = locales[currentLang]?.completeSettlement || 'Complete Settlement';
                completeSettlementBtn.classList.remove('edit-mode'); completeSettlementBtn.classList.remove('hidden');
            }
        }
    }
    
    function toggleExpenseForm(isLocked) {
        expenseFormCard.classList.toggle('is-settled', isLocked);
        expenseFormCard.querySelectorAll('input, select, button').forEach(el => { el.disabled = isLocked; });
    }

    function clearInputs() {
        itemNameInput.value = ''; itemAmountInput.value = '';
        document.getElementById('add-custom-rate').value = '';
        document.getElementById('add-rate-config-wrapper').classList.add('hidden');
        splitMethodSelect.value = 'equal';
        itemDateInput.value = getLocalISOString();
        
        splitAmountInputs.querySelectorAll('input').forEach(inp => inp.value = '');

        if(currentSettlement) itemCurrencySelect.value = currentSettlement.base_currency;
        handleSplitMethodChange(splitMethodSelect, itemAmountInput, splitAmountInputs);
        itemNameInput.focus();
    }

    function downloadExcel() {
        if (!currentSettlement || currentSettlement.expenses.length === 0) { showToast(locales[currentLang]?.noDataToExport || 'No expense data to export.', 'error'); return; }
        const { title, participants, expenses, base_currency } = currentSettlement;
        const translations = locales[currentLang] || {};
        const dataForExport = [];
        
        const header = [
            translations.tableHeaderDate || 'Date',
            translations.tableHeaderItem || 'Item',
            translations.tableHeaderTotal || 'Total Amount',
            translations.tableHeaderPayer || 'Payer'
        ];
        participants.forEach(p => header.push((translations.shareOf || '{name} Share').replace('{name}', p)));

        const appName = translations.appTitle ? translations.appTitle.split('|')[0].trim() : 'Settle Up';
        dataForExport.push([`${title} - ${appName} 정산 내역`]);

        const subHeaderRow = new Array(header.length).fill('');
        subHeaderRow[0] = `참여자: ${participants.join(', ')}`;
        subHeaderRow[header.length - 1] = `기준 통화: ${base_currency}`;
        dataForExport.push(subHeaderRow);

        dataForExport.push([]); 
        
        dataForExport.push(header);
    
        const participantTotals = {};
        participants.forEach(p => participantTotals[p] = 0);

        expenses.forEach(exp => {
            let excelAmountStr = `${formatNumber(exp.original_amount, 2)} ${exp.currency}`;
            if (exp.currency !== base_currency) {
                const appliedRate = exp.amount / exp.original_amount;
                excelAmountStr += ` (적용환율: ${formatNumber(appliedRate, 4)})`;
            }
            
            let dateStr = '';
            if (exp.expense_date) {
                const d = new Date(exp.expense_date);
                dateStr = d.toLocaleString();
            }

            const rowData = [ dateStr, exp.name, excelAmountStr, exp.payer ];
            participants.forEach(p => {
                const shareAmount = exp.shares[p] || 0;
                rowData.push(`${formatNumber(shareAmount, 2)} ${base_currency}`);
                participantTotals[p] += shareAmount;
            });
            dataForExport.push(rowData);
        });

        const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        const transfers = calculateMinimumTransfers(expenses, participants);

        const totalsRow = [
            '', 
            translations.totalExpense || '총 지출', 
            `${formatNumber(totalAmount, 2)} ${base_currency}`, 
            ''  
        ];
        participants.forEach(p => totalsRow.push(`${formatNumber(participantTotals[p], 2)} ${base_currency}`));
        dataForExport.push(totalsRow);

        dataForExport.push([]); 
        
        const resultTitleRowIndex = dataForExport.length; 
        const resultTitleRow = new Array(header.length).fill('');
        resultTitleRow[0] = translations.settlementResult || '정산 결과';
        dataForExport.push(resultTitleRow);

        if (transfers.length === 0) {
            const doneRow = new Array(header.length).fill('');
            doneRow[0] = translations.settlementDone || '정산이 완료되었습니다. (송금 필요 없음)';
            dataForExport.push(doneRow);
        } else {
            transfers.forEach(tr => {
                const trRow = new Array(header.length).fill('');
                trRow[0] = `${tr.from} ➡️ ${tr.to}`; 
                trRow[1] = `${formatNumber(tr.amount, 2)} ${base_currency}`;
                dataForExport.push(trRow);
            });
        }

        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(dataForExport);
    
        if(!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } });
        ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: header.length - 2 } });
        ws['!merges'].push({ s: { r: resultTitleRowIndex, c: 0 }, e: { r: resultTitleRowIndex, c: 1 } });
        
        if (transfers.length === 0) {
            ws['!merges'].push({ s: { r: resultTitleRowIndex + 1, c: 0 }, e: { r: resultTitleRowIndex + 1, c: 1 } });
        }

        const colWidths = [];
        dataForExport.forEach((row, rowIndex) => {
            if (rowIndex === 0 || rowIndex === 1 || rowIndex === resultTitleRowIndex) return; 
            
            row.forEach((cell, i) => {
                const cellValue = cell ? cell.toString() : '';
                let length = 0;
                for (let char of cellValue) {
                    length += char.charCodeAt(0) > 255 ? 2.1 : 1.1; 
                }
                const cellWidth = Math.max(12, Math.ceil(length) + 2); 
                if (!colWidths[i] || colWidths[i] < cellWidth) {
                    colWidths[i] = cellWidth;
                }
            });
        });
        ws['!cols'] = colWidths.map(w => ({ wch: w }));

        const range = XLSX.utils.decode_range(ws['!ref']);
        const headerRowIdx = 3;
        const totalRowIdx = headerRowIdx + expenses.length + 1;

        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
                if (!ws[cell_ref]) continue;
                
                if (R === 0) {
                    ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { sz: 16, bold: true, color: { rgb: "4F46E5" } }, fill: { fgColor: { rgb: "EEF2FF" } } };
                } else if (R === 1) {
                    if (C === header.length - 1) {
                        ws[cell_ref].s = { font: { bold: true, color: { rgb: "64748B" } }, alignment: { horizontal: "right", vertical: "center" } };
                    } else {
                        ws[cell_ref].s = { font: { bold: true, color: { rgb: "64748B" } }, alignment: { horizontal: "left", vertical: "center" } };
                    }
                } else if (R === headerRowIdx) {
                    ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } };
                } else if (R === totalRowIdx) {
                    ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } } };
                } else if (R === resultTitleRowIndex) {
                    if (C <= 1) {
                        ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "6366F1" } } };
                    }
                } else if (R > resultTitleRowIndex) {
                    if (C === 0 || C === 1) {
                        ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true, sz: 12, color: { rgb: "1E293B" } } };
                    }
                } else if (R > 3 && R < totalRowIdx) {
                    ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" } };
                }
            }
        }
    
        XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
        const fileName = `${translations.expenseReport || 'Expense_Report'}_${title}_${timestamp}.xlsx`;
        XLSX.writeFile(wb, fileName, { cellStyles: true });
        showToast('엑셀 파일이 다운로드되었습니다.', 'success');
    }

    initialize();
});