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

    let presenceChannel = null;
    let isPresenceJoined = false; 

    // 타이핑 상태 관리를 위한 변수들
    let currentlyTypingUsers = {};
    let typingClearTimers = {};
    let myTypingTimeout = null;
    let isMeTyping = false;
    let myNickname = '알 수 없음'; 

    async function triggerPushNotification(roomId) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        
        const inThisChat = window.location.pathname.includes('chat.html') && currentSettlementId === roomId;
        if (inThisChat && !document.hidden) return;

        const isAdmin = currentUser && currentUser.email.toLowerCase() === 'eowert72@gmail.com';
        const disguise = isAdmin && localStorage.getItem('adminDisguisePush') === 'true';

        let title = "SETTLE UP";
        let body = "새로운 메시지가 도착했습니다.";

        if (!disguise) {
            const { data } = await supabaseClient.from('settlements').select('title').eq('id', roomId).single();
            if (data) {
                title = data.title;
                body = `새로운 메시지가 있습니다.`;
            }
        } else {
            body = ""; 
        }

        new Notification(title, { body: body, icon: 'icon.png' });
    }

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

    let dbAdminPin = '';
    let inactivityTimer = null;

    function resetInactivityTimer() {
        const lockOverlay = document.getElementById('chat-lock-overlay');
        if (lockOverlay && !lockOverlay.classList.contains('hidden')) return; 

        if (inactivityTimer) clearTimeout(inactivityTimer);
        const isAdmin = currentUser && currentUser.email.toLowerCase() === 'eowert72@gmail.com';
        const autoLock = localStorage.getItem('adminAutoLock') === 'true';
        
        if (isAdmin && autoLock && dbAdminPin) {
            inactivityTimer = setTimeout(() => {
                if (lockOverlay) lockOverlay.classList.remove('hidden');
            }, 60000); 
        }
    }

    const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
    if (chatMessages && scrollBottomBtn) {
        chatMessages.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = chatMessages;
            if (scrollHeight - scrollTop - clientHeight > 100) {
                scrollBottomBtn.classList.remove('hidden');
            } else {
                scrollBottomBtn.classList.add('hidden');
            }
            
            if (scrollHeight - scrollTop - clientHeight <= 50) {
                updateMyReadTime();
            }
        });

        scrollBottomBtn.addEventListener('click', () => {
            chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
            updateMyReadTime();
        });
    }

    const editModal = document.getElementById('edit-modal');
    const deleteModal = document.getElementById('delete-confirm-modal');
    const editTextarea = document.getElementById('edit-modal-textarea');
    
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

    const openAdminConfirmModal = (message, callback) => {
        if (adminConfirmMsgDesc) adminConfirmMsgDesc.innerHTML = message;
        adminActionCallback = callback;
        if (adminConfirmModal) adminConfirmModal.classList.add('show');
    };

    const closeAllModals = () => {
        document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
        targetMessageId = null;
        originalMessageContent = null;
        adminActionCallback = null; 
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

    // 타이핑 UI 업데이트 함수
    function updateTypingUI() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (!typingIndicator) return;
        
        const names = Object.values(currentlyTypingUsers);
        if (names.length === 0) {
            typingIndicator.classList.add('hidden');
            typingIndicator.textContent = '';
        } else if (names.length === 1) {
            typingIndicator.textContent = `${names[0]} 님이 채팅 입력중입니다...`;
            typingIndicator.classList.remove('hidden');
        } else {
            typingIndicator.textContent = `${names.join(', ')} 님이 채팅 입력중입니다...`;
            typingIndicator.classList.remove('hidden');
        }
    }

    // 메인 화면(바깥)의 알림 뱃지를 위해 '내 읽음 시간'만 간단하게 DB에 저장
    async function updateMyReadTime() {
        if (!currentUser || !currentSettlementId) return;
        
        await supabaseClient.from('settlement_members')
            .upsert({ 
                settlement_id: currentSettlementId,
                user_id: currentUser.id,
                email: currentUser.email,
                last_read_at: new Date().toISOString()
            }, { onConflict: 'settlement_id,user_id' });
    }

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
            backBtn.addEventListener('click', async () => {
                await updateMyReadTime(); 
                window.location.href = `index.html?id=${currentSettlementId}`;
            });
        }

        const lockBackBtn = document.getElementById('lock-back-btn');
        if (lockBackBtn) {
            lockBackBtn.addEventListener('click', async () => {
                await updateMyReadTime();
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
        
        window.addEventListener('mousemove', resetInactivityTimer);
        window.addEventListener('keydown', resetInactivityTimer);
        window.addEventListener('touchstart', resetInactivityTimer);
        window.addEventListener('scroll', resetInactivityTimer);
        
        const isAdmin = currentUser.email.toLowerCase() === 'eowert72@gmail.com';
        const autoLock = localStorage.getItem('adminAutoLock') === 'true';

        const { data: myProfile } = await supabaseClient.from('profiles').select('nickname, admin_pin').eq('user_id', currentUser.id).single();
        if (myProfile) {
            myNickname = myProfile.nickname || currentUser.email.split('@')[0];
            if (isAdmin && myProfile.admin_pin) {
                dbAdminPin = myProfile.admin_pin;
            }
        }
        
        presenceChannel = supabaseClient.channel(`presence_room_${currentSettlementId}`, {
            config: { broadcast: { self: true } }
        });
        
        let isChatStarted = false;
        async function startChatSession() {
            if (isChatStarted) return;
            isChatStarted = true;
            if (chatMessages) {
                await loadMessages(chatMessages);
                subscribeToMessages(chatMessages);
                await updateMyReadTime();
            }
            resetInactivityTimer();
        }

        const lockOverlay = document.getElementById('chat-lock-overlay');
        const unlockBtn = document.getElementById('unlock-chat-btn');
        const unlockInput = document.getElementById('unlock-password-input');
        
        if (unlockBtn && unlockInput) {
            unlockBtn.addEventListener('click', () => {
                const pwd = unlockInput.value;
                if (!pwd) return;
                
                if (pwd === dbAdminPin) {
                    if(lockOverlay) lockOverlay.classList.add('hidden');
                    unlockInput.value = '';
                    startChatSession(); 
                } else {
                    alert('잠금 해제 PIN이 일치하지 않습니다.');
                }
            });
            unlockInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') unlockBtn.click();
            });
        }

        const isLockEnabled = isAdmin && autoLock && dbAdminPin;

        if (isLockEnabled) {
            if(lockOverlay) lockOverlay.classList.remove('hidden');
        } else {
            if(lockOverlay) lockOverlay.classList.add('hidden'); 
            startChatSession(); 
        }

        const adminClearBtn = document.getElementById('admin-clear-chat-btn');
        if (isAdmin) {
            if (adminClearBtn) adminClearBtn.classList.remove('hidden');
        }

        if (adminClearBtn) {
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

        const onlineCountEl = document.getElementById('online-count');
        
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
            // 타이핑 Broadcast 수신부
            .on('broadcast', { event: 'typing' }, (payload) => {
                if (payload.payload && payload.payload.user_id) {
                    const { user_id, nickname, is_typing } = payload.payload;
                    if (user_id === currentUser.id) return; // 내가 치는 건 무시

                    if (is_typing) {
                        currentlyTypingUsers[user_id] = nickname;
                        clearTimeout(typingClearTimers[user_id]);
                        typingClearTimers[user_id] = setTimeout(() => {
                            delete currentlyTypingUsers[user_id];
                            updateTypingUI();
                        }, 3000);
                    } else {
                        delete currentlyTypingUsers[user_id];
                        clearTimeout(typingClearTimers[user_id]);
                    }
                    updateTypingUI();
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    isPresenceJoined = true; 
                    await presenceChannel.track({ user_id: currentUser.id });
                    updateMyReadTime();
                }
            });

        if (sendChatBtn && chatInput) {
            chatInput.addEventListener('input', () => {
                if (!isMeTyping) {
                    isMeTyping = true;
                    if (isPresenceJoined && presenceChannel) {
                        presenceChannel.send({
                            type: 'broadcast',
                            event: 'typing',
                            payload: { user_id: currentUser.id, nickname: myNickname, is_typing: true }
                        });
                    }
                }
                
                clearTimeout(myTypingTimeout);
                myTypingTimeout = setTimeout(() => {
                    isMeTyping = false;
                    if (isPresenceJoined && presenceChannel) {
                        presenceChannel.send({
                            type: 'broadcast',
                            event: 'typing',
                            payload: { user_id: currentUser.id, nickname: myNickname, is_typing: false }
                        });
                    }
                }, 1500); 
            });

            sendChatBtn.addEventListener('click', () => sendMessage(chatInput));
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendMessage(chatInput);
            });
        }

    } else {
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

        async function checkRoomChange() {
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = urlParams.get('id');

            if (roomId && roomId !== currentSettlementId) {
                currentSettlementId = roomId;
                unreadCount = 0;
                updateBadge();
                chatFab.classList.remove('hidden');

                if (chatSubscription) supabaseClient.removeChannel(chatSubscription);
                
                if (!currentUser) {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    currentUser = session ? session.user : null;
                }

                if (currentUser) {
                    const { data: memberData } = await supabaseClient
                        .from('settlement_members')
                        .select('last_read_at')
                        .eq('settlement_id', currentSettlementId)
                        .eq('user_id', currentUser.id)
                        .single();
                        
                    const lastReadAt = memberData?.last_read_at || '1970-01-01T00:00:00Z';
                    
                    const { count } = await supabaseClient
                        .from('chat_messages')
                        .select('id', { count: 'exact', head: true })
                        .eq('settlement_id', currentSettlementId)
                        .neq('user_id', currentUser.id)
                        .neq('is_hidden_admin', true)
                        .gt('created_at', lastReadAt);
                        
                    if (count !== null) {
                        unreadCount = count;
                        updateBadge();
                    }
                }
                
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
                                triggerPushNotification(payload.new.settlement_id);
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

    // 🚀 [완벽 수정] 수정 즉시 화면 렌더링 (Optimistic UI)
    async function editMessageInDB(msgId, newContent) {
        const msgDiv = document.querySelector(`.chat-msg-wrapper[data-id="${msgId}"]`);
        if (msgDiv) {
            const bubble = msgDiv.querySelector('.chat-bubble');
            if (bubble) bubble.innerHTML = newContent + '<span class="edited-tag">(수정됨)</span>';
        }

        const { error } = await supabaseClient
            .from('chat_messages')
            .update({ content: newContent, is_edited: true })
            .eq('id', msgId);
        
        if (error) {
            console.error(error);
            alert('메시지 수정에 실패했습니다.');
        }
    }

    // 🚀 [완벽 수정] 삭제 즉시 화면 렌더링 (Optimistic UI)
    async function deleteMessageInDB(msgId) {
        const msgDiv = document.querySelector(`.chat-msg-wrapper[data-id="${msgId}"]`);
        if (msgDiv) {
            const bubble = msgDiv.querySelector('.chat-bubble');
            if (bubble) {
                bubble.innerHTML = '🚫 삭제된 메시지입니다.';
                bubble.className = 'chat-bubble deleted';
            }
        }

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
                    // 🚀 [완벽 수정] 내가 이미 화면에 그려둔 메시지면 중복 추가 방지 (Optimistic UI 호환)
                    if (document.querySelector(`.chat-msg-wrapper[data-id="${newMsg.id}"]`)) return;

                    const { data: profile } = await supabaseClient.from('profiles').select('nickname').eq('user_id', newMsg.user_id).single();
                    newMsg.profiles = profile || { nickname: '알 수 없음' };
                    appendMessageUI(newMsg, container);
                    
                    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
                        scrollToBottom(container);
                        updateMyReadTime();
                    }
                    
                    if (newMsg.user_id !== currentUser.id) {
                        triggerPushNotification(newMsg.settlement_id);
                    }
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
                else if (msgDiv && updatedMsg.user_id !== currentUser.id) {
                    // 내 메시지는 내가 낙관적 UI로 처리했으므로, 다른 사람이 수정한 경우만 화면 갱신
                    const { data: profile } = await supabaseClient.from('profiles').select('nickname').eq('user_id', updatedMsg.user_id).single();
                    updatedMsg.profiles = profile || { nickname: '알 수 없음' };
                    renderMessageContent(msgDiv, updatedMsg, container);
                }
            })
            .subscribe();
    }

    // 🚀 [완벽 수정] 메시지 보내기 즉시 화면 렌더링 (Optimistic UI)
    async function sendMessage(inputEl) {
        const content = inputEl.value.trim();
        if (!content || !currentSettlementId || !currentUser) return;
        
        inputEl.value = '';
        inputEl.focus();
        
        if (isMeTyping) {
            isMeTyping = false;
            clearTimeout(myTypingTimeout);
            if (isPresenceJoined && presenceChannel) {
                presenceChannel.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: { user_id: currentUser.id, nickname: myNickname, is_typing: false }
                });
            }
        }

        // 1. 내 화면에 0초 만에 즉시 렌더링
        const tempId = 'temp-' + Date.now();
        const tempMsg = {
            id: tempId,
            user_id: currentUser.id,
            content: content,
            created_at: new Date().toISOString(),
            is_edited: false,
            is_deleted: false,
            profiles: { nickname: myNickname }
        };
        appendMessageUI(tempMsg, chatMessages);
        scrollToBottom(chatMessages);

        // 2. 조용히 백그라운드 DB 저장
        const { data, error } = await supabaseClient.from('chat_messages').insert([{
            settlement_id: currentSettlementId,
            user_id: currentUser.id,
            content: content
        }]).select('id').single();
        
        // 3. 서버 저장이 완료되면 임시 ID를 진짜 ID로 슬쩍 교체
        if (!error && data) {
            const tempDiv = document.querySelector(`.chat-msg-wrapper[data-id="${tempId}"]`);
            if (tempDiv) tempDiv.dataset.id = data.id; 
        }
        
        updateMyReadTime();
    }

    function appendMessageUI(msg, container) {
        const isMine = msg.user_id === currentUser.id;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg-wrapper ${isMine ? 'mine' : 'other'}`;
        msgDiv.dataset.id = msg.id;
        msgDiv.dataset.time = msg.created_at; 
        msgDiv.dataset.uid = msg.user_id; 
        
        renderMessageContent(msgDiv, msg, container);
        container.appendChild(msgDiv);
    }

    function renderMessageContent(msgDiv, msg, container) {
        msgDiv.dataset.uid = msg.user_id; 
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

        const timeWrapperHtml = `
            <div class="chat-time-wrapper" style="align-items: ${isMine ? 'flex-end' : 'flex-start'};">
                <span class="chat-time" style="margin:0;">${timeStr}</span>
            </div>
        `;

        let html = '';
        if (!isMine) html += `<div class="chat-sender">${nickname}</div>`;
        
        const isAdmin = currentUser.email.toLowerCase() === 'eowert72@gmail.com';
        const canEditOrDelete = isMine && !msg.is_deleted;
        const showMenuOptions = canEditOrDelete || isAdmin;

        html += `<div class="chat-content-wrapper">`;
        if (isMine) {
            if (showMenuOptions) {
                html += `<div class="msg-options-container"><div class="msg-options-menu">`;
                if (canEditOrDelete) {
                    html += `<button class="edit-msg-btn">수정</button><button class="delete-msg-btn">삭제</button>`;
                }
                if (isAdmin) {
                    html += `<button class="admin-hide-msg-btn" style="color:#10b981; border-top:1px solid #f1f5f9;"><i class="fas fa-eye-slash"></i> 강제숨김</button>`;
                }
                html += `</div><button class="msg-options-btn"><i class="fas fa-ellipsis-v"></i></button></div>`;
            }
            html += timeWrapperHtml;
            html += `<div class="${bubbleClass}">${contentHtml}${editedHtml}</div>`;
        } else {
            html += `<div class="${bubbleClass}">${contentHtml}${editedHtml}</div>`;
            html += timeWrapperHtml;
            if (showMenuOptions) {
                html += `<div class="msg-options-container"><div class="msg-options-menu">`;
                if (canEditOrDelete) {
                    html += `<button class="edit-msg-btn">수정</button><button class="delete-msg-btn">삭제</button>`;
                }
                if (isAdmin) {
                    html += `<button class="admin-hide-msg-btn" style="color:#10b981; border-top:1px solid #f1f5f9;"><i class="fas fa-eye-slash"></i> 강제숨김</button>`;
                }
                html += `</div><button class="msg-options-btn"><i class="fas fa-ellipsis-v"></i></button></div>`;
            }
        }
        html += `</div>`;
        
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