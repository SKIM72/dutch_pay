document.addEventListener('DOMContentLoaded', async () => {
    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    let currentUser = null;
    let currentSettlementId = null;

    // 세션 초기화
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session ? session.user : null;

    supabaseClient.auth.onAuthStateChange((event, session) => {
        currentUser = session ? session.user : null;
    });

    // 💡 화면 밖 클릭 시 열려있는 말풍선 메뉴 닫기
    document.addEventListener('click', () => {
        document.querySelectorAll('.msg-options-menu.show').forEach(menu => menu.classList.remove('show'));
    });

    const isChatPage = window.location.pathname.includes('chat.html');

    if (isChatPage) {
        // ==========================================
        // [새로운 페이지] chat.html 전용 로직
        // ==========================================
        const urlParams = new URLSearchParams(window.location.search);
        currentSettlementId = urlParams.get('id');

        if (!currentSettlementId) {
            alert('잘못된 접근입니다.');
            window.location.href = 'index.html';
            return;
        }

        const backBtn = document.getElementById('chat-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.location.href = `index.html?id=${currentSettlementId}`;
            });
        }

        const chatMessages = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const sendChatBtn = document.getElementById('send-chat-btn');

        if (!currentUser) {
            alert('로그인이 필요합니다.');
            window.location.href = 'login.html';
            return;
        }

        // 메시지 내역 불러오기 및 실시간 구독 시작
        await loadMessages(chatMessages);
        subscribeToMessages(chatMessages);

        // 전송 이벤트
        sendChatBtn.addEventListener('click', () => sendMessage(chatInput));
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage(chatInput);
        });

    } else {
        // ==========================================
        // [기존 페이지] index.html 전용 로직 (알림 뱃지 및 이동 버튼)
        // ==========================================
        const chatFab = document.getElementById('chat-fab');
        const unreadBadge = document.getElementById('chat-unread-badge');
        let chatSubscription = null;
        let unreadCount = 0;

        if (!chatFab) return;

        chatFab.addEventListener('click', () => {
            if (currentSettlementId) {
                window.location.href = `chat.html?id=${currentSettlementId}`;
            }
        });

        const originalReplaceState = history.replaceState;
        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            checkRoomChange();
        };
        window.addEventListener('popstate', checkRoomChange);
        setTimeout(checkRoomChange, 800);

        function checkRoomChange() {
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = urlParams.get('id');

            if (roomId && roomId !== currentSettlementId) {
                currentSettlementId = roomId;
                unreadCount = 0;
                updateBadge();
                chatFab.classList.remove('hidden');

                if (chatSubscription) supabaseClient.removeChannel(chatSubscription);
                
                chatSubscription = supabaseClient
                    .channel(`chat_badge_${currentSettlementId}`)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'chat_messages',
                        filter: `settlement_id=eq.${currentSettlementId}`
                    }, (payload) => {
                        if (currentUser && payload.new.user_id !== currentUser.id) {
                            unreadCount++;
                            updateBadge();
                        }
                    }).subscribe();
                    
            } else if (!roomId) {
                currentSettlementId = null;
                chatFab.classList.add('hidden');
                if (chatSubscription) {
                    supabaseClient.removeChannel(chatSubscription);
                    chatSubscription = null;
                }
            }
        }

        function updateBadge() {
            if (unreadCount > 0) {
                unreadBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                unreadBadge.classList.remove('hidden');
            } else {
                unreadBadge.classList.add('hidden');
            }
        }
    }

    // ==========================================
    // 🚀 [추가] DB에 메시지 수정 및 삭제 요청 함수
    // ==========================================
    async function editMessageInDB(msgId, newContent) {
        const { error } = await supabaseClient
            .from('chat_messages')
            .update({ content: newContent, is_edited: true })
            .eq('id', msgId);
        
        if (error) {
            console.error(error);
            alert('메시지 수정에 실패했습니다.');
        }
    }

    async function deleteMessageInDB(msgId) {
        const { error } = await supabaseClient
            .from('chat_messages')
            .update({ is_deleted: true })
            .eq('id', msgId);
            
        if (error) {
            console.error(error);
            alert('메시지 삭제에 실패했습니다.');
        }
    }

    // ==========================================
    // 공통 채팅 함수 (chat.html 전용)
    // ==========================================
    async function loadMessages(container) {
        // 🚀 조회 쿼리에 is_edited, is_deleted 추가
        const { data, error } = await supabaseClient
            .from('chat_messages')
            .select(`id, content, created_at, user_id, is_edited, is_deleted, profiles(nickname)`)
            .eq('settlement_id', currentSettlementId)
            .order('created_at', { ascending: true });

        if (data) {
            container.innerHTML = '';
            data.forEach(msg => appendMessageUI(msg, container));
            scrollToBottom(container);
        }
    }

    function subscribeToMessages(container) {
        supabaseClient
            .channel(`chat_room_view_${currentSettlementId}`)
            // 1. 새로운 메시지가 달렸을 때 (INSERT)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `settlement_id=eq.${currentSettlementId}`
            }, async (payload) => {
                const newMsg = payload.new;
                const { data: profile } = await supabaseClient.from('profiles').select('nickname').eq('user_id', newMsg.user_id).single();
                newMsg.profiles = profile || { nickname: '알 수 없음' };
                appendMessageUI(newMsg, container);
                scrollToBottom(container);
            })
            // 🚀 2. [추가] 누군가 메시지를 수정하거나 삭제했을 때 (UPDATE)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'chat_messages',
                filter: `settlement_id=eq.${currentSettlementId}`
            }, async (payload) => {
                const updatedMsg = payload.new;
                const msgDiv = document.querySelector(`.chat-msg-wrapper[data-id="${updatedMsg.id}"]`);
                if (msgDiv) {
                    const { data: profile } = await supabaseClient.from('profiles').select('nickname').eq('user_id', updatedMsg.user_id).single();
                    updatedMsg.profiles = profile || { nickname: '알 수 없음' };
                    // 기존 말풍선의 내용만 갈아끼움
                    renderMessageContent(msgDiv, updatedMsg, container);
                }
            })
            .subscribe();
    }

    async function sendMessage(inputEl) {
        const content = inputEl.value.trim();
        if (!content || !currentSettlementId || !currentUser) return;
        
        inputEl.value = '';
        inputEl.focus();

        await supabaseClient.from('chat_messages').insert([{
            settlement_id: currentSettlementId,
            user_id: currentUser.id,
            content: content
        }]);
    }

    // 🚀 수정/삭제를 위해 구조 분리 (DOM 렌더링)
    function appendMessageUI(msg, container) {
        const isMine = msg.user_id === currentUser.id;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg-wrapper ${isMine ? 'mine' : 'other'}`;
        msgDiv.dataset.id = msg.id; // 업데이트를 위해 ID 부여
        
        renderMessageContent(msgDiv, msg, container);
        container.appendChild(msgDiv);
    }

    // 🚀 말풍선 내부 컨텐츠만 다시 그리는 함수 (수정/삭제 시 재활용)
    function renderMessageContent(msgDiv, msg, container) {
        msgDiv.innerHTML = ''; // 기존 내용 초기화
        
        const isMine = msg.user_id === currentUser.id;
        const nickname = msg.profiles?.nickname || '알 수 없음';
        const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        
        let contentHtml = msg.content;
        let bubbleClass = 'chat-bubble';
        let editedHtml = (msg.is_edited && !msg.is_deleted) ? `<span class="edited-tag">(수정됨)</span>` : '';

        // 삭제된 메시지일 경우 처리
        if (msg.is_deleted) {
            contentHtml = '🚫 삭제된 메시지입니다.';
            bubbleClass += ' deleted';
            editedHtml = '';
        }

        let html = '';
        if (!isMine) html += `<div class="chat-sender">${nickname}</div>`;
        
        html += `<div class="chat-content-wrapper">`;
        
        // 내 메시지이고 삭제되지 않은 경우에만 '수정/삭제' 메뉴 추가
        if (isMine && !msg.is_deleted) {
            html += `
                <div class="msg-options-container">
                    <button class="msg-options-btn"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="msg-options-menu">
                        <button class="edit-msg-btn">수정</button>
                        <button class="delete-msg-btn">삭제</button>
                    </div>
                </div>
            `;
        }
        
        html += `<div class="${bubbleClass}">${contentHtml}${editedHtml}</div>`;
        html += `</div>`;
        html += `<div class="chat-time">${timeStr}</div>`;
        
        msgDiv.innerHTML = html;

        // 수정/삭제 버튼 이벤트 연결
        if (isMine && !msg.is_deleted) {
            const optBtn = msgDiv.querySelector('.msg-options-btn');
            const menu = msgDiv.querySelector('.msg-options-menu');
            const editBtn = msgDiv.querySelector('.edit-msg-btn');
            const deleteBtn = msgDiv.querySelector('.delete-msg-btn');

            optBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 문서 클릭 이벤트로 전달되지 않게 막음
                // 다른 열려있는 메뉴 모두 닫기
                document.querySelectorAll('.msg-options-menu.show').forEach(m => {
                    if (m !== menu) m.classList.remove('show');
                });
                menu.classList.toggle('show');
            });

            editBtn.addEventListener('click', () => {
                menu.classList.remove('show');
                const newContent = prompt('메시지를 수정하세요:', msg.content);
                if (newContent !== null && newContent.trim() !== '' && newContent !== msg.content) {
                    editMessageInDB(msg.id, newContent.trim());
                }
            });

            deleteBtn.addEventListener('click', () => {
                menu.classList.remove('show');
                if (confirm('이 메시지를 삭제하시겠습니까?')) {
                    deleteMessageInDB(msg.id);
                }
            });
        }
    }

    function scrollToBottom(container) {
        container.scrollTop = container.scrollHeight;
    }
});