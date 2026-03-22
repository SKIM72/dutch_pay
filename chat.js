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

    const chatMessages = document.getElementById('chat-messages');

    // ==========================================
    // 🚀 [수정됨] 모바일 가상 키보드 최적화 로직 (visualViewport 사용)
    // ==========================================
    const setVh = () => {
        // visualViewport가 지원되면 키보드 제외 실제 높이 사용, 아니면 기본 innerHeight 사용
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        
        // CSS var(--vh) 변수 실시간 업데이트
        document.documentElement.style.setProperty('--vh', `${viewportHeight * 0.01}px`);
        
        const container = document.querySelector('.chat-page-container');
        if(container && window.innerWidth <= 600) {
            container.style.height = `${viewportHeight}px`; // 높이 즉시 동기화
        } else if(container) {
            container.style.height = '100vh'; 
        }
        
        // 화면이 줄어들 때(키보드가 올라올 때) 채팅창 마지막을 볼 수 있도록 즉시 아래로 스크롤
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    };

    // 최신 모바일 브라우저 대응 (가상 키보드 감지 특화)
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setVh);
    } else {
        window.addEventListener('resize', setVh);
    }
    setVh(); 

    // 모달 DOM 제어
    const editModal = document.getElementById('edit-modal');
    const deleteModal = document.getElementById('delete-confirm-modal');
    const editTextarea = document.getElementById('edit-modal-textarea');
    
    let targetMessageId = null;
    let originalMessageContent = null;

    const openEditModal = (msgId, currentContent) => {
        targetMessageId = msgId;
        originalMessageContent = currentContent;
        if (editTextarea) editTextarea.value = currentContent;
        if (editModal) editModal.classList.add('show');
        setTimeout(() => { if (editTextarea) editTextarea.focus(); }, 250); 
    };

    const openDeleteModal = (msgId) => {
        targetMessageId = msgId;
        if (deleteModal) deleteModal.classList.add('show');
    };

    const closeAllModals = () => {
        document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
        targetMessageId = null;
        originalMessageContent = null;
        if (editTextarea) {
            editTextarea.blur();
            editTextarea.value = '';
        }
    };

    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeAllModals();
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
            document.querySelectorAll('.msg-options-menu.show').forEach(menu => menu.classList.remove('show'));
        }
    });

    const submitEditBtn = document.getElementById('submit-edit-modal-btn');
    if (submitEditBtn) {
        submitEditBtn.addEventListener('click', () => {
            const newContent = editTextarea ? editTextarea.value.trim() : '';
            if (newContent && newContent !== originalMessageContent && targetMessageId) {
                editMessageInDB(targetMessageId, newContent);
            }
            closeAllModals(); 
        });
    }

    const submitDeleteBtn = document.getElementById('submit-delete-modal-btn');
    if (submitDeleteBtn) {
        submitDeleteBtn.addEventListener('click', () => {
            if (targetMessageId) {
                deleteMessageInDB(targetMessageId);
            }
            closeAllModals(); 
        });
    }

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

        const onlineCountEl = document.getElementById('online-count');
        const presenceChannel = supabaseClient.channel(`presence_room_${currentSettlementId}`);
        
        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const newState = presenceChannel.presenceState();
                
                const uniqueUsers = new Set();
                for (const key in newState) {
                    newState[key].forEach(user => {
                        uniqueUsers.add(user.user_id);
                    });
                }
                
                if (onlineCountEl) {
                    onlineCountEl.textContent = uniqueUsers.size;
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        user_id: currentUser.id
                    });
                }
            });

        if (sendChatBtn && chatInput) {
            sendChatBtn.addEventListener('click', () => sendMessage(chatInput));
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendMessage(chatInput);
            });
        }

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
    // 공통 함수 (전체 유지)
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

            if(optBtn) {
                optBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.msg-options-menu.show').forEach(m => {
                        if (m !== menu) m.classList.remove('show');
                    });
                    menu.classList.toggle('show');
                });
            }

            if(editBtn) {
                editBtn.addEventListener('click', () => {
                    menu.classList.remove('show');
                    openEditModal(msg.id, msg.content);
                });
            }

            if(deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    menu.classList.remove('show');
                    openDeleteModal(msg.id);
                });
            }
        }
    }

    function scrollToBottom(container) {
        if(container) container.scrollTop = container.scrollHeight;
    }
});