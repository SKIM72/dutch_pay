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

    // 읽음 표시 관리를 위한 전역 변수
    let totalRoomMembers = 0;
    let memberReadTimes = {}; 

    // 푸시 알림 기능 
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

    async function initReadReceipts() {
        if (!currentSettlementId) return;

        const { data, error } = await supabaseClient
            .from('settlement_members')
            .select('user_id, last_read_at')
            .eq('settlement_id', currentSettlementId);

        if (data) {
            totalRoomMembers = data.length;
            data.forEach(m => {
                memberReadTimes[m.user_id] = new Date(m.last_read_at || 0).getTime();
            });
        }

        supabaseClient.channel(`reads_${currentSettlementId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'settlement_members', 
                filter: `settlement_id=eq.${currentSettlementId}` 
            }, (payload) => {
                if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                    memberReadTimes[payload.new.user_id] = new Date(payload.new.last_read_at || 0).getTime();
                } else if (payload.eventType === 'DELETE') {
                    delete memberReadTimes[payload.old.user_id];
                    totalRoomMembers--;
                }
                if (payload.eventType === 'INSERT') totalRoomMembers++;
                
                updateAllUnreadCounts();
            }).subscribe();
    }

    // 🚀 [수정] 클라이언트-서버 간 시차 문제를 완벽 해결하는 로직
    async function updateMyReadTime() {
        if (!currentUser || !currentSettlementId) return;
        
        let maxTime = Date.now();
        // 현재 화면에 렌더링된 모든 메시지의 시간을 스캔하여 가장 최신 시간을 추출
        document.querySelectorAll('.chat-msg-wrapper').forEach(msgDiv => {
            if (msgDiv.dataset.time) {
                const msgTime = new Date(msgDiv.dataset.time).getTime();
                if (msgTime > maxTime) maxTime = msgTime;
            }
        });
        
        // 데이터베이스 시차 보정을 위해 가장 최신 메시지보다 +1초를 줘서 "확실하게 모두 읽음" 처리
        memberReadTimes[currentUser.id] = maxTime + 1000;
        
        await supabaseClient.from('settlement_members')
            .update({ last_read_at: new Date(memberReadTimes[currentUser.id]).toISOString() })
            .eq('settlement_id', currentSettlementId)
            .eq('user_id', currentUser.id);
            
        updateAllUnreadCounts();
    }

    // 🚀 [수정] 발송자 판별 로직 추가 (보낸 사람은 무조건 +1)
    function getUnreadCount(msgTimeStr, senderId) {
        const msgTime = new Date(msgTimeStr).getTime();
        let readCount = 0;
        for (const uid in memberReadTimes) {
            // 메시지를 보낸 본인은 당연히 읽은 상태이므로 카운트
            if (uid === senderId) {
                readCount++;
            } else if (memberReadTimes[uid] >= msgTime) {
                readCount++;
            }
        }
        const unread = totalRoomMembers - readCount;
        return unread > 0 ? unread : 0;
    }

    function updateAllUnreadCounts() {
        document.querySelectorAll('.chat-msg-wrapper').forEach(msgDiv => {
            // 오직 내가 보낸 메시지(mine)에만 읽음 숫자를 적용
            if (msgDiv.classList.contains('mine')) {
                const unreadEl = msgDiv.querySelector('.unread-count');
                if (unreadEl && msgDiv.dataset.time && msgDiv.dataset.uid) {
                    const count = getUnreadCount(msgDiv.dataset.time, msgDiv.dataset.uid);
                    unreadEl.textContent = count > 0 ? count : '';
                }
            } else {
                // 남이 보낸 메시지 영역은 항상 비워둠
                const unreadEl = msgDiv.querySelector('.unread-count');
                if (unreadEl) unreadEl.textContent = '';
            }
        });
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
            backBtn.addEventListener('click', () => {
                window.location.href = `index.html?id=${currentSettlementId}`;
            });
        }

        const lockBackBtn = document.getElementById('lock-back-btn');
        if (lockBackBtn) {
            lockBackBtn.addEventListener('click', () => {
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

        if (isAdmin) {
            const { data: profile } = await supabaseClient.from('profiles').select('admin_pin').eq('user_id', currentUser.id).single();
            if (profile && profile.admin_pin) {
                dbAdminPin = profile.admin_pin;
            }
        }
        
        let isChatStarted = false;
        async function startChatSession() {
            if (isChatStarted) return;
            isChatStarted = true;
            if (chatMessages) {
                await initReadReceipts();
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
        
        updateMyReadTime();
    }

    // 🚀 [수정] 렌더링 시 보낸 사람의 ID(uid)를 완벽하게 심어줌
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
        msgDiv.dataset.uid = msg.user_id; // 재렌더링 시 누락 방지용 확실한 갱신
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

        // 🚀 [수정] 렌더링 시 발송자 ID를 함께 넘겨 정확한 계산 수행
        const unreadCount = getUnreadCount(msg.created_at, msg.user_id);
        const displayUnread = (isMine && unreadCount > 0) ? unreadCount : '';
        const timeWrapperHtml = `
            <div class="chat-time-wrapper" style="align-items: ${isMine ? 'flex-end' : 'flex-start'};">
                <span class="unread-count">${displayUnread}</span>
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