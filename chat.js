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

    // 💡 핵심: 현재 실행 중인 HTML 파일이 메인인지 채팅창인지 주소로 파악
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

        // 상단 뒤로가기 버튼: 메인 페이지의 해당 정산방으로 리턴
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

        // 기존 모달 열기 대신, 클릭하면 chat.html 로 새 창(페이지) 이동
        chatFab.addEventListener('click', () => {
            if (currentSettlementId) {
                window.location.href = `chat.html?id=${currentSettlementId}`;
            }
        });

        // 방 이동 감지 (main.js에서 방을 바꿀 때 URL이 바뀌는 것을 캐치)
        const originalReplaceState = history.replaceState;
        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            checkRoomChange();
        };
        window.addEventListener('popstate', checkRoomChange);
        setTimeout(checkRoomChange, 800); // 초기 로딩 후 최초 확인 딜레이

        function checkRoomChange() {
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = urlParams.get('id');

            // 새 방에 입장한 경우
            if (roomId && roomId !== currentSettlementId) {
                currentSettlementId = roomId;
                unreadCount = 0;
                updateBadge();
                chatFab.classList.remove('hidden');

                if (chatSubscription) supabaseClient.removeChannel(chatSubscription);
                
                // 백그라운드에서 메시지가 오는지 감시하여 뱃지 숫자만 올림
                chatSubscription = supabaseClient
                    .channel(`chat_badge_${currentSettlementId}`)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'chat_messages',
                        filter: `settlement_id=eq.${currentSettlementId}`
                    }, (payload) => {
                        // 내가 보낸 메시지가 아닐 때만 알림
                        if (currentUser && payload.new.user_id !== currentUser.id) {
                            unreadCount++;
                            updateBadge();
                        }
                    }).subscribe();
                    
            } else if (!roomId) {
                // 방에서 나간 경우 버튼 숨김
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
    // 공통 채팅 함수 (chat.html 전용)
    // ==========================================
    async function loadMessages(container) {
        const { data, error } = await supabaseClient
            .from('chat_messages')
            .select(`id, content, created_at, user_id, profiles(nickname)`)
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
                
                // 닉네임 가져오기 (실시간으로 누군가 메시지를 썼을 때)
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('nickname')
                    .eq('user_id', newMsg.user_id)
                    .single();
                    
                newMsg.profiles = profile || { nickname: '알 수 없음' };
                appendMessageUI(newMsg, container);
                scrollToBottom(container);
            }).subscribe();
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
        const nickname = msg.profiles?.nickname || '알 수 없음';
        const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg-wrapper ${isMine ? 'mine' : 'other'}`;
        
        let html = '';
        if (!isMine) html += `<div class="chat-sender">${nickname}</div>`;
        html += `<div class="chat-bubble">${msg.content}</div>`;
        html += `<div class="chat-time">${timeStr}</div>`;
        
        msgDiv.innerHTML = html;
        container.appendChild(msgDiv);
    }

    function scrollToBottom(container) {
        container.scrollTop = container.scrollHeight;
    }
});