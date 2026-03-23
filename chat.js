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

    // 모바일 가상 키보드 최적화 로직
    const setVh = () => {
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.documentElement.style.setProperty('--vh', `${viewportHeight * 0.01}px`);
        
        const container = document.querySelector('.chat-page-container');
        if(container && window.innerWidth <= 600) {
            container.style.height = `${viewportHeight}px`; 
        } else if(container) {
            container.style.height = '100vh'; 
        }
        
        if (chatMessages && chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 50) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    };

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setVh);
    } else {
        window.addEventListener('resize', setVh);
    }
    setVh(); 

    // 하단 스크롤 버튼 감지 로직
    const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
    if (chatMessages && scrollBottomBtn) {
        chatMessages.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = chatMessages;
            if (scrollHeight - scrollTop - clientHeight > 100) {
                scrollBottomBtn.classList.remove('hidden');
            } else {
                scrollBottomBtn.classList.add('hidden');
            }
        });

        scrollBottomBtn.addEventListener('click', () => {
            chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
        });
    }

    // 모달 DOM 제어
    const editModal = document.getElementById('edit-modal');
    const deleteModal = document.getElementById('delete-confirm-modal');
    const editTextarea = document.getElementById('edit-modal-textarea');
    
    // 🚀 [추가] 관리자 모달 변수 설정
    const adminConfirmModal = document.getElementById('admin-confirm-modal');
    const adminConfirmMsgDesc = document.getElementById('admin-confirm-msg-desc');
    let adminActionCallback = null;
    
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

    // 🚀 [추가] 관리자 모달 열기 함수
    const openAdminConfirmModal = (message, callback) => {
        if (adminConfirmMsgDesc) adminConfirmMsgDesc.innerHTML = message;
        adminActionCallback = callback;
        if (adminConfirmModal) adminConfirmModal.classList.add('show');
    };

    const closeAllModals = () => {
        document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
        targetMessageId = null;
        originalMessageContent = null;
        adminActionCallback = null; // 🚀 콜백 초기화
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

    // 🚀 [추가] 관리자 모달 확인 버튼 리스너
    const submitAdminConfirmBtn = document.getElementById('submit-admin-confirm-btn');
    if (submitAdminConfirmBtn) {
        submitAdminConfirmBtn.addEventListener('click', () => {
            if (adminActionCallback) adminActionCallback();
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

        const adminClearBtn = document.getElementById('admin-clear-chat-btn');
        if (currentUser.email === 'eowert72@gmail.com') {
            if (adminClearBtn) adminClearBtn.classList.remove('hidden');
        }

        if (adminClearBtn) {
            // 🚀 [수정] confirm() 대신 커스텀 모달 호출
            adminClearBtn.addEventListener('click', () => {
                openAdminConfirmModal(
                    '이 채팅방의 모든 대화 내역을 화면에서 즉시 삭제하시겠습니까?<br><span style="font-size:0.8rem; color:#64748b; font-weight:normal;">(데이터베이스에는 기록이 보존됩니다.)</span>',
                    async () => {
                        const { error } = await supabaseClient
                            .from('chat_messages')
                            .update({ is_hidden_admin: true })
                            .eq('settlement_id', currentSettlementId);
                        
                        if (error) {
                            alert('내역 비우기 실패: 권한 부족 (SQL 설정 확인 필요)');
                            console.error(error);
                        } else {
                            if(chatMessages) chatMessages.innerHTML = '';
                        }
                    }
                );
            });
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
                            if(!payload.new.is_hidden_admin) {
                                unreadCount++;
                                updateBadge();
                            }
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
            .select(`id, content, created_at, user_id, is_edited, is_deleted, is_hidden_admin, profiles(nickname)`)
            .eq('settlement_id', currentSettlementId)
            .order('created_at', { ascending: true });

        if (data) {
            container.innerHTML = '';
            data.forEach(msg => {
                if (!msg.is_hidden_admin) {
                    appendMessageUI(msg, container);
                }
            });
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
                if (!newMsg.is_hidden_admin) {
                    const { data: profile } = await supabaseClient.from('profiles').select('nickname').eq('user_id', newMsg.user_id).single();
                    newMsg.profiles = profile || { nickname: '알 수 없음' };
                    appendMessageUI(newMsg, container);
                    scrollToBottom(container);
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'chat_messages',
                filter: `settlement_id=eq.${currentSettlementId}`
            }, async (payload) => {
                const updatedMsg = payload.new;
                const msgDiv = document.querySelector(`.chat-msg-wrapper[data-id="${updatedMsg.id}"]`);
                
                if (updatedMsg.is_hidden_admin) {
                    if (msgDiv) msgDiv.remove();
                } 
                else if (msgDiv) {
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
        
        const isAdmin = currentUser.email === 'eowert72@gmail.com';
        const canEditOrDelete = isMine && !msg.is_deleted;
        const showMenuOptions = canEditOrDelete || isAdmin;

        html += `<div class="chat-content-wrapper">`;
        if (showMenuOptions) {
            html += `
                <div class="msg-options-container">
                    <div class="msg-options-menu">`;
            
            if (canEditOrDelete) {
                html += `<button class="edit-msg-btn">수정</button>`;
                html += `<button class="delete-msg-btn">삭제</button>`;
            }
            
            if (isAdmin) {
                html += `<button class="admin-hide-msg-btn" style="color:#10b981; border-top:1px solid #f1f5f9;"><i class="fas fa-eye-slash"></i> 강제숨김</button>`;
            }

            html += `</div>
                    <button class="msg-options-btn"><i class="fas fa-ellipsis-v"></i></button>
                </div>
            `;
        }
        
        html += `<div class="${bubbleClass}">${contentHtml}${editedHtml}</div>`;
        html += `</div>`;
        html += `<div class="chat-time">${timeStr}</div>`;
        
        msgDiv.innerHTML = html;

        if (showMenuOptions) {
            const optBtn = msgDiv.querySelector('.msg-options-btn');
            const menu = msgDiv.querySelector('.msg-options-menu');
            const editBtn = msgDiv.querySelector('.edit-msg-btn');
            const deleteBtn = msgDiv.querySelector('.delete-msg-btn');
            const adminHideBtn = msgDiv.querySelector('.admin-hide-msg-btn');

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

            if(adminHideBtn) {
                // 🚀 [수정] confirm() 대신 커스텀 모달 호출
                adminHideBtn.addEventListener('click', () => {
                    menu.classList.remove('show');
                    openAdminConfirmModal(
                        '이 메시지를 화면에서 완전히 삭제하시겠습니까?<br><span style="font-size:0.8rem; color:#64748b; font-weight:normal;">(데이터베이스에는 기록이 보존됩니다.)</span>',
                        async () => {
                            const { error } = await supabaseClient
                                .from('chat_messages')
                                .update({ is_hidden_admin: true })
                                .eq('id', msg.id);
                            if(error) alert('숨기기 실패 (SQL 권한 확인): ' + error.message);
                        }
                    );
                });
            }
        }
    }

    function scrollToBottom(container) {
        if(container) container.scrollTop = container.scrollHeight;
    }
});