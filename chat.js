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

    // ==========================================
    // 🚀 1. [추가] 모바일 최적화 및 커스텀 모달 제어 전역 로직
    // ==========================================
    
    // (1) 모바일 주소창 대응: 실제 뷰포트 높이 계산 및 적용
    const setVh = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        const container = document.querySelector('.chat-page-container');
        if(container && window.innerWidth <= 600) {
            container.style.height = `calc(var(--vh, 1vh) * 100)`;
        } else if(container) {
            container.style.height = '100vh'; // PC는 그대로
        }
    };
    window.addEventListener('resize', setVh);
    setVh(); // 초기 실행

    // (2) DOM 요소 및 모달 상태
    const chatMessages = document.getElementById('chat-messages');
    
    // 모달 DOM
    const editModal = document.getElementById('edit-modal');
    const deleteModal = document.getElementById('delete-confirm-modal');
    const editTextarea = document.getElementById('edit-modal-textarea');
    
    // 현재 모달 작업 중인 메시지 ID 및 내용
    let targetMessageId = null;
    let originalMessageContent = null;

    // (3) 모달 열기/닫기 함수
    const openEditModal = (msgId, currentContent) => {
        targetMessageId = msgId;
        originalMessageContent = currentContent;
        editTextarea.value = currentContent;
        editModal.classList.add('show');
        setTimeout(() => editTextarea.focus(), 250); // 자연스럽게 포커스
    };

    const openDeleteModal = (msgId) => {
        targetMessageId = msgId;
        deleteModal.classList.add('show');
    };

    const closeAllModals = () => {
        document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
        targetMessageId = null;
        originalMessageContent = null;
        editTextarea.blur();
        editTextarea.value = '';
    };

    // (4) 모달 내 공통 닫기 버튼 이벤트 연결
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // 오버레이 클릭 시 닫기
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeAllModals();
        });
    });

    // ESC 키로 모달 및 ellipsis 메뉴 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
            document.querySelectorAll('.msg-options-menu.show').forEach(menu => menu.classList.remove('show'));
        }
    });

    // (5) 모달 실제 제출 이벤트
    document.getElementById('submit-edit-modal-btn').addEventListener('click', () => {
        const newContent = editTextarea.value.trim();
        // 내용이 바뀌었고, 비어있지 않을 때만 수정 진행
        if (newContent && newContent !== originalMessageContent && targetMessageId) {
            editMessageInDB(targetMessageId, newContent);
        }
        closeAllModals(); // 성공/실패 여부 관계없이 모달은 닫음
    });

    document.getElementById('submit-delete-modal-btn').addEventListener('click', () => {
        if (targetMessageId) {
            deleteMessageInDB(targetMessageId);
        }
        closeAllModals(); // 성공/실패 여부 관계없이 모달은 닫음
    });


    // (6) ellipsis(…) 메뉴 화면 밖 클릭 시 닫기 (기존 로직 유지)
    document.addEventListener('click', () => {
        document.querySelectorAll('.msg-options-menu.show').forEach(menu => menu.classList.remove('show'));
    });

    const isChatPage = window.location.pathname.includes('chat.html');

    if (isChatPage) {
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

        const chatInput = document.getElementById('chat-input');
        const sendChatBtn = document.getElementById('send-chat-btn');

        if (!currentUser) {
            alert('로그인이 필요합니다.');
            window.location.href = 'login.html';
            return;
        }

        await loadMessages(chatMessages);
        subscribeToMessages(chatMessages);

        sendChatBtn.addEventListener('click', () => sendMessage(chatInput));
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage(chatInput);
        });

    } else {
        // [기존 페이지] index.html 로직 (전체 유지)
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
    // 공통 함수 (전체 유지 - InDB 함수들 건드리지 않음)
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

    async function loadMessages(container) {
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

    function appendMessageUI(msg, container) {
        const isMine = msg.user_id === currentUser.id;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg-wrapper ${isMine ? 'mine' : 'other'}`;
        msgDiv.dataset.id = msg.id;
        
        renderMessageContent(msgDiv, msg, container);
        container.appendChild(msgDiv);
    }

    function renderMessageContent(msgDiv, msg, container) {
        msgDiv.innerHTML = '';
        const isMine = msg.user_id === currentUser.id;
        const nickname = msg.profiles?.nickname || '알 수 없음';
        const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        
        let contentHtml = msg.content;
        let bubbleClass = 'chat-bubble';
        let editedHtml = (msg.is_edited && !msg.is_deleted) ? `<span class="edited-tag">(수정됨)</span>` : '';

        if (msg.is_deleted) {
            contentHtml = '🚫 삭제된 메시지입니다.';
            bubbleClass += ' deleted';
            editedHtml = '';
        }

        let html = '';
        if (!isMine) html += `<div class="chat-sender">${nickname}</div>`;
        
        html += `<div class="chat-content-wrapper">`;
        if (isMine && !msg.is_deleted) {
            html += `
                <div class="msg-options-container">
                    <div class="msg-options-menu">
                        <button class="edit-msg-btn">수정</button>
                        <button class="delete-msg-btn">삭제</button>
                    </div>
                    <button class="msg-options-btn"><i class="fas fa-ellipsis-v"></i></button>
                </div>
            `;
        }
        
        html += `<div class="${bubbleClass}">${contentHtml}${editedHtml}</div>`;
        html += `</div>`;
        html += `<div class="chat-time">${timeStr}</div>`;
        
        msgDiv.innerHTML = html;

        if (isMine && !msg.is_deleted) {
            const optBtn = msgDiv.querySelector('.msg-options-btn');
            const menu = msgDiv.querySelector('.msg-options-menu');
            const editBtn = msgDiv.querySelector('.edit-msg-btn');
            const deleteBtn = msgDiv.querySelector('.delete-msg-btn');

            optBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.msg-options-menu.show').forEach(m => {
                    if (m !== menu) m.classList.remove('show');
                });
                menu.classList.toggle('show');
            });

            editBtn.addEventListener('click', () => {
                menu.classList.remove('show');
                // 🚀 [수정] prompt() 대신 커스텀 수정 모달 열기
                openEditModal(msg.id, msg.content);
            });

            deleteBtn.addEventListener('click', () => {
                menu.classList.remove('show');
                // 🚀 [수정] confirm() 대신 커스텀 삭제 모달 열기
                openDeleteModal(msg.id);
            });
        }
    }

    function scrollToBottom(container) {
        container.scrollTop = container.scrollHeight;
    }
});