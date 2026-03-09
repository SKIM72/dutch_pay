document.addEventListener('DOMContentLoaded', async () => {

    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

    // --- Global State ---
    let settlements = [];
    let currentSettlement = null;
    let currentLang = 'ko';
    let currentEditingExpenseId = null;
    let currentUser = null; 
    let mySelectedRole = null; 
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
    
    const settlementSearchInput = document.getElementById('settlement-search-input');

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

    const openShareModalBtn = document.getElementById('open-share-modal-btn'); 
    const openJoinModalBtn = document.getElementById('open-join-modal-btn'); 

    const joinRoomBtn = document.getElementById('join-room-btn'); 
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
    
    const editSettlementTitleBtn = document.getElementById('edit-settlement-title-btn');
    const editTitleModal = document.getElementById('edit-title-modal');
    const editTitleInput = document.getElementById('edit-title-input');
    const saveTitleBtn = document.getElementById('save-title-btn');

    function getLocale(key, fallbackText) {
        if (typeof locales !== 'undefined' && locales[currentLang] && locales[currentLang][key]) {
            return locales[currentLang][key];
        }
        return fallbackText || key;
    }

    const formatNumber = (num, decimals = 2) => isNaN(num) ? '0' : num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const parseFormattedNumber = (str) => parseFloat(String(str).replace(/,/g, '')) || 0;
    
    function getLocalDateString() { 
        const now = new Date(); 
        return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0]; 
    }
    function getLocalISOString() { 
        const now = new Date(); 
        return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16); 
    }
    function formatDisplayDate(dateStr) {
        if (!dateStr) return '';
        if (dateStr.includes('T')) return new Date(new Date(dateStr).getTime() - (new Date(dateStr).getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        return dateStr;
    }

    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if(!container) return; 
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        let iconClass = type === 'error' ? 'fa-exclamation-circle' : type === 'info' ? 'fa-info-circle' : 'fa-check-circle';
        toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    function showConfirm(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-confirm-modal');
            if(!modal) { resolve(window.confirm(message)); return; } 
            document.getElementById('confirm-message').textContent = message;
            modal.classList.remove('hidden');
            const confirmBtn = document.getElementById('confirm-yes-btn');
            const cancelBtn = document.getElementById('confirm-no-btn');
            const cleanup = () => { modal.classList.add('hidden'); confirmBtn.removeEventListener('click', handleYes); cancelBtn.removeEventListener('click', handleNo); };
            const handleYes = () => { cleanup(); resolve(true); };
            const handleNo = () => { cleanup(); resolve(false); };
            confirmBtn.addEventListener('click', handleYes);
            cancelBtn.addEventListener('click', handleNo);
        });
    }

    function setLoading(isLoading) { 
        const loader = document.getElementById('global-loader');
        if(loader) { if (isLoading) loader.classList.remove('hidden'); else loader.classList.add('hidden'); }
    }

    function getJoinedRooms() { 
        try { return JSON.parse(localStorage.getItem('joinedRooms') || '[]'); } 
        catch (e) { localStorage.removeItem('joinedRooms'); return []; }
    }
    
    function saveJoinedRoom(roomId) {
        let rooms = getJoinedRooms();
        if (!rooms.includes(roomId)) {
            rooms.push(roomId);
            localStorage.setItem('joinedRooms', JSON.stringify(rooms));
        }
    }

    function updateAuthUI() {
        if (currentUser) {
            if(authBtn) { authBtn.innerHTML = `<i class="fas fa-sign-out-alt" style="color: var(--danger);"></i> <span style="color: var(--danger);">${getLocale('logout', '로그아웃')}</span>`; authBtn.style.background = '#fee2e2'; authBtn.style.borderColor = 'transparent'; }
            if(addSettlementFab) addSettlementFab.classList.remove('hidden'); 
            if(userInfoDisplay && userEmailText) { userEmailText.textContent = currentUser.email; userInfoDisplay.classList.remove('hidden'); }
        } else {
            if(authBtn) { authBtn.innerHTML = `<i class="fas fa-sign-in-alt"></i> <span>${getLocale('login', '로그인')}</span>`; authBtn.style.background = 'transparent'; authBtn.style.borderColor = 'var(--border)'; }
            if(addSettlementFab) addSettlementFab.classList.add('hidden'); 
            if(userInfoDisplay) userInfoDisplay.classList.add('hidden');
        }
    }

    async function handleAuthClick() {
        if (currentUser) { 
            if (await showConfirm(getLocale('logoutConfirm', '정말로 로그아웃 하시겠습니까?'))) {
                setLoading(true); 
                await supabaseClient.auth.signOut(); 
                window.location.replace('login.html'); 
            }
        } 
        else { 
            window.location.href = 'login.html'; 
        }
    }

    function updateUI(lang) {
        currentLang = lang;
        if (typeof locales === 'undefined') return; 
        const translations = locales[lang] || {};
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if (translations[key]) el.innerHTML = translations[key]; });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { const key = el.getAttribute('data-i18n-placeholder'); if (translations[key]) el.placeholder = translations[key]; });
        
        const splitOptions = document.querySelectorAll('[data-i18n-options]');
        if(splitOptions) {
            splitOptions.forEach(el => {
                const keys = el.getAttribute('data-i18n-options').split(',');
                el.innerHTML = '';
                keys.forEach(key => {
                    const option = document.createElement('option');
                    const value = key.trim();
                    option.value = value === 'splitEqually' ? 'equal' : 'amount';
                    option.textContent = translations[value] || value;
                    el.appendChild(option);
                });
            });
        }
        updateAuthUI();
        if (currentSettlement) { updateParticipantNames(currentSettlement.participants); render(); }
        renderSettlementList();
    }

    function setLanguage(lang) { 
        localStorage.setItem('preferredLang', lang); 
        if(languageSwitcher) languageSwitcher.value = lang; 
        updateUI(lang); 
    }

    function renderParticipantInputs(initialCount = 2) {
        if(!participantListContainer) return;
        participantListContainer.innerHTML = '';
        for (let i = 0; i < initialCount; i++) { addParticipantInputUI(); }
        updateRemoveButtons();
    }

    function addParticipantInputUI(value = '') {
        if(!participantListContainer) return;
        const div = document.createElement('div');
        div.className = 'participant-input-group';
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'participant-name-input';
        input.placeholder = getLocale('participantPlaceholder', `참가자 이름 (예: 친구 {n})`).replace('{n}', participantListContainer.children.length + 1);
        input.value = value;
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button'; removeBtn.className = 'remove-participant-btn'; removeBtn.innerHTML = '<i class="fas fa-minus"></i>';
        removeBtn.onclick = () => { div.remove(); updateRemoveButtons(); };
        div.appendChild(input); div.appendChild(removeBtn);
        participantListContainer.appendChild(div);
        updateRemoveButtons();
    }

    function updateRemoveButtons() {
        if(!participantListContainer) return;
        const btns = participantListContainer.querySelectorAll('.remove-participant-btn');
        if (btns.length <= 2) { btns.forEach(btn => btn.disabled = true); } 
        else { btns.forEach(btn => btn.disabled = false); }
    }

    function getParticipantNamesFromModal() {
        if(!participantListContainer) return ['A', 'B'];
        const inputs = participantListContainer.querySelectorAll('.participant-name-input');
        const names = Array.from(inputs).map(input => input.value.trim()).filter(val => val !== '');
        return names.length >= 2 ? names : ['A', 'B']; 
    }

    async function fallbackCopyTextToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed"; 
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                return successful;
            } catch (err) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    }

    function openShareModal() {
        if(!currentSettlement) return;
        const currentUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${currentUrl}?id=${currentSettlement.id}`;
        
        const shareLinkInput = document.getElementById('share-link-input');
        if(shareLinkInput) shareLinkInput.value = shareUrl;
        
        const fallbackCode = String(currentSettlement.id).split('-')[0].toUpperCase();
        const inviteCode = currentSettlement.invite_code || fallbackCode;
        
        const shareCodeInput = document.getElementById('share-code-input');
        if(shareCodeInput) shareCodeInput.value = inviteCode;

        const qrContainer = document.getElementById('qrcode-container');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            if (typeof QRCode !== 'undefined') {
                new QRCode(qrContainer, {
                    text: shareUrl,
                    width: 160,
                    height: 160,
                    colorDark : "#1e293b",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }
        }
        
        const shareModal = document.getElementById('share-modal');
        if(shareModal) shareModal.classList.remove('hidden');
    }

    function sendEmailInvite() {
        if(!currentSettlement) return;
        const currentUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${currentUrl}?id=${currentSettlement.id}`;
        const fallbackCode = String(currentSettlement.id).split('-')[0].toUpperCase();
        const inviteCode = currentSettlement.invite_code || fallbackCode;
        
        const subject = encodeURIComponent(`[Settle Up] ${currentSettlement.title} 정산에 초대합니다.`);
        const body = encodeURIComponent(`👋 ${currentSettlement.title} 정산 방이 만들어졌습니다!\n\n아래 링크를 클릭해서 바로 참여하거나, 앱에서 아래의 초대 코드를 입력해 주세요.\n\n🔗 접속 링크: ${shareUrl}\n🔑 초대 코드: ${inviteCode}\n\n감사합니다!`);
        
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }

    async function joinRoomByCode() {
        const joinCodeInput = document.getElementById('join-code-input');
        if(!joinCodeInput) return;
        
        const codeInput = joinCodeInput.value.trim().toUpperCase();
        if(!codeInput) { showToast('코드를 입력해주세요.', 'error'); return; }

        setLoading(true);
        let { data, error } = await supabaseClient
            .from('settlements')
            .select('id')
            .eq('invite_code', codeInput)
            .is('deleted_at', null) 
            .single();
            
        if ((error || !data) && /^\d+$/.test(codeInput)) {
            const numericId = parseInt(codeInput, 10);
            const { data: idData, error: idError } = await supabaseClient
                .from('settlements')
                .select('id')
                .eq('id', numericId)
                .is('deleted_at', null) 
                .single();
            
            data = idData;
            error = idError;
        }
            
        if(error || !data) {
            setLoading(false);
            showToast('유효하지 않은 코드이거나 방을 찾을 수 없습니다.', 'error');
            return;
        }

        saveJoinedRoom(data.id);
        joinCodeInput.value = '';
        
        const joinModal = document.getElementById('join-modal');
        if(joinModal) joinModal.classList.add('hidden');
        
        showToast('성공적으로 방에 참가했습니다!', 'success');
        await loadData();
        await loadSingleSettlement(data.id);
        setLoading(false);
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
            if (!rate) throw new Error(`Rate not found for ${target}`);
            exchangeRatesCache[cacheKey] = rate; 
            return rate;
        } catch (error) { 
            return null; 
        }
    }

    async function initialize() {
        try {
            setLoading(true);

            const { data: { session } } = await supabaseClient.auth.getSession();
            currentUser = session ? session.user : null;

            const browserLang = navigator.language.split('-')[0];
            setLanguage(localStorage.getItem('preferredLang') || (['ko', 'en', 'ja'].includes(browserLang) ? browserLang : 'en'));
            setupEventListeners(); 
            if(itemDateInput) itemDateInput.value = getLocalISOString();

            updateAuthUI();

            const urlParams = new URLSearchParams(window.location.search);
            const guestRoomId = urlParams.get('id');

            if (guestRoomId) {
                await loadSingleSettlement(guestRoomId);
                
                if (currentUser) {
                    if (!getJoinedRooms().includes(guestRoomId)) {
                        saveJoinedRoom(guestRoomId);
                        showToast('정산 방에 자동 참가되었습니다.', 'success');
                        await loadData(); 
                    }
                    if (joinRoomBtn) joinRoomBtn.classList.add('hidden');
                } else {
                    localStorage.setItem('pendingJoinRoomId', guestRoomId);
                    if (!getJoinedRooms().includes(guestRoomId) && joinRoomBtn) {
                        joinRoomBtn.classList.remove('hidden');
                    }
                }
            } else {
                if (!currentUser) {
                    window.location.replace('login.html'); 
                    return; 
                } else {
                    const pendingId = localStorage.getItem('pendingJoinRoomId');
                    if (pendingId) {
                        saveJoinedRoom(pendingId);
                        localStorage.removeItem('pendingJoinRoomId');
                        showToast('정산 방에 자동 참가되었습니다.', 'success');
                        window.history.replaceState({}, '', `${window.location.pathname}?id=${pendingId}`);
                        await loadData();
                        await loadSingleSettlement(pendingId);
                    } else {
                        await loadData(); 
                    }
                }
            }

            supabaseClient.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT' && !guestRoomId) {
                    window.location.replace('login.html');
                } else {
                    currentUser = session ? session.user : null;
                    updateAuthUI();
                }
            });

        } catch (error) {
            console.error("초기화 중 에러 발생:", error);
            showToast("초기화 중 오류가 발생했습니다.", "error");
        } finally {
            setLoading(false);
        }
    }

    async function loadSingleSettlement(roomId) {
        if (window.innerWidth > 768 && sidebar) sidebar.classList.add('collapsed'); 
        
        const { data, error } = await supabaseClient
            .from('settlements')
            .select(`*, expenses (*)`)
            .eq('id', roomId)
            .is('deleted_at', null) 
            .single();
            
        if (error || !data) {
            showToast('존재하지 않거나 삭제된 정산건입니다.', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000); 
            return;
        }
        selectSettlement(data);
    }

    async function loadData() {
        let allRooms = [];
        if (currentUser) {
            const { data, error } = await supabaseClient
                .from('settlements')
                .select(`* , expenses (*)`)
                .eq('user_id', currentUser.id)
                .is('deleted_at', null); 
                
            if (error) {
                console.error("데이터 로드 에러:", error);
                if (error.message.includes('invite_code')) showToast("🚨 필수: SQL 에디터에서 invite_code 컬럼을 추가해주세요!", "error");
                else if (error.message.includes('user_id')) showToast("🚨 필수: SQL 에디터에서 user_id 컬럼을 추가해주세요!", "error");
                return;
            }
            if (data) {
                data.forEach(room => room.is_host = true);
                allRooms = [...allRooms, ...data];
            }
        }

        const joinedIds = getJoinedRooms();
        if (joinedIds.length > 0) {
            const { data: guestData } = await supabaseClient
                .from('settlements')
                .select(`* , expenses (*)`)
                .in('id', joinedIds)
                .is('deleted_at', null); 
                
            if (guestData) {
                guestData.forEach(room => {
                    if (!allRooms.find(r => r.id === room.id)) {
                        room.is_host = false; 
                        allRooms.push(room);
                    }
                });
            }
        }

        settlements = allRooms;
        settlements.sort((a, b) => new Date(b.date) - new Date(a.date));
        renderSettlementList();
    }

    function renderSettlementList() {
        if(!settlementListContainer) return;
        
        const query = settlementSearchInput ? settlementSearchInput.value.toLowerCase().trim() : '';
        let displaySettlements = settlements;
        
        if (query) {
            displaySettlements = settlements.filter(s => {
                const titleMatch = (s.title || '').toLowerCase().includes(query);
                const dateMatch = (formatDisplayDate(s.date) || '').includes(query);
                return titleMatch || dateMatch;
            });
        }
        
        if (displaySettlements.length === 0) {
            const fallbackText = query ? getLocale('noSearchResult', '검색 결과가 없습니다.') : getLocale('noHistory', '참여 중인 정산 내역이 없습니다.');
            settlementListContainer.innerHTML = `<p class="subtitle" style="text-align: center; color: var(--text-muted); margin-top: 1.5rem; font-size: 0.9rem;">${fallbackText}</p>`;
            return;
        }
        
        settlementListContainer.innerHTML = displaySettlements.map(s => `
            <div class="settlement-item-wrapper">
                <button class="settlement-item ${s.is_settled ? 'is-settled' : ''}" data-id="${s.id}">
                    <div class="item-content">
                        <div class="item-text-group">
                            <div class="item-badges">
                                ${s.is_host ? `<span class="badge badge-host"><i class="fas fa-crown"></i> ${getLocale('host', '방장')}</span>` : `<span class="badge badge-guest"><i class="fas fa-users"></i> ${getLocale('participating', '참여중')}</span>`}
                            </div>
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
                ${s.is_host 
                    ? `<button class="delete-settlement-btn" data-id="${s.id}" title="방 삭제"><i class="fas fa-trash-alt"></i></button>`
                    : `<button class="leave-settlement-btn" data-id="${s.id}" title="방 나가기"><i class="fas fa-sign-out-alt"></i></button>`
                }
            </div>
        `).join('');
        
        document.querySelectorAll('.settlement-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const s = settlements.find(room => room.id == btn.dataset.id);
                if(s) selectSettlement(s);
            });
        });

        document.querySelectorAll('.delete-settlement-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                deleteSettlement(parseInt(e.currentTarget.dataset.id));
            });
        });

        document.querySelectorAll('.leave-settlement-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                leaveSettlement(parseInt(e.currentTarget.dataset.id));
            });
        });
        
        if(currentSettlement) {
            const currentItem = document.querySelector(`.settlement-item[data-id='${currentSettlement.id}']`);
            if (currentItem) currentItem.classList.add('active');
        }
    }

    function updateOpenGraphTags(settlement) {
        let ogTitle = document.querySelector('meta[property="og:title"]');
        let ogDesc = document.querySelector('meta[property="og:description"]');
        let ogUrl = document.querySelector('meta[property="og:url"]');

        const shareUrl = `${window.location.origin}${window.location.pathname}?id=${settlement.id}`;
        const titleText = `💸 [${settlement.title}] 정산이 도착했어요!`;
        const descText = "내야 할 금액을 확인하고 간편하게 송금하세요.";

        if (ogTitle) ogTitle.content = titleText;
        if (ogDesc) ogDesc.content = descText;
        if (ogUrl) ogUrl.content = shareUrl;
        
        document.title = titleText; 
    }

    function selectSettlement(settlement) {
        currentSettlement = settlement;
        
        if(placeholderRightPane) placeholderRightPane.classList.add('hidden');
        if(calculatorView) calculatorView.classList.remove('hidden');
        if(settlementDisplay) settlementDisplay.textContent = settlement.title;
        if(itemCurrencySelect) itemCurrencySelect.value = settlement.base_currency;
        
        if(editSettlementTitleBtn) {
            if(currentUser) editSettlementTitleBtn.classList.remove('hidden');
            else editSettlementTitleBtn.classList.add('hidden');
        }

        const wrapper = document.getElementById('add-rate-config-wrapper');
        if(wrapper) wrapper.classList.add('hidden'); 
        
        updateParticipantNames(settlement.participants);
        renderTableHeader(settlement.participants);

        document.querySelectorAll('.settlement-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id == settlement.id);
        });
        
        if (window.innerWidth <= 768 && sidebar) sidebar.classList.add('collapsed');
        if(itemDateInput) itemDateInput.value = getLocalISOString();
        
        window.history.replaceState({}, '', `${window.location.pathname}?id=${settlement.id}`);
        
        updateOpenGraphTags(settlement);

        render();
    }

    function renderTableHeader(participants) {
        if(!expenseTableHeaderRow) return;
        const children = Array.from(expenseTableHeaderRow.children);
        while (expenseTableHeaderRow.children.length > 3) { 
            expenseTableHeaderRow.removeChild(expenseTableHeaderRow.lastChild); 
        }
        const shareOfString = getLocale('shareOf', '{name}님 분담액');
        participants.forEach(p => {
            const th = document.createElement('th'); 
            th.textContent = shareOfString.replace('{name}', p); 
            expenseTableHeaderRow.appendChild(th);
        });
        const actionTh = document.createElement('th'); 
        actionTh.setAttribute('data-i18n', 'tableHeaderActions'); 
        actionTh.textContent = getLocale('tableHeaderActions', '관리'); 
        expenseTableHeaderRow.appendChild(actionTh);
    }

    function updateParticipantNames(participants) {
        const paidByString = getLocale('paidBy', '{payer}님이 결제');
        const shareOfString = getLocale('shareOf', '{name}님 분담액');

        if(itemPayerSelect) itemPayerSelect.innerHTML = participants.map(p => `<option value="${p}">${paidByString.replace('{payer}', p)}</option>`).join('');
        if(editItemPayerSelect) editItemPayerSelect.innerHTML = participants.map(p => `<option value="${p}">${paidByString.replace('{payer}', p)}</option>`).join('');

        if(splitAmountInputs) splitAmountInputs.innerHTML = ''; 
        if(editSplitAmountInputs) editSplitAmountInputs.innerHTML = '';

        participants.forEach(p => {
            if(splitAmountInputs) {
                const addDiv = document.createElement('div'); addDiv.className = 'dynamic-split-item'; 
                addDiv.innerHTML = `<label>${p}</label><input type="text" data-participant="${p}" placeholder="${shareOfString.replace('{name}', p)}" inputmode="decimal">`; 
                splitAmountInputs.appendChild(addDiv);
            }
            if(editSplitAmountInputs) {
                const editDiv = document.createElement('div'); editDiv.className = 'dynamic-split-item'; 
                editDiv.innerHTML = `<label>${p}</label><input type="text" data-participant="${p}" inputmode="decimal">`; 
                editSplitAmountInputs.appendChild(editDiv);
            }
        });

        if(splitAmountInputs) attachDynamicSplitInputListeners(splitAmountInputs, itemAmountInput, updateAddPreview);
        if(editSplitAmountInputs) attachDynamicSplitInputListeners(editSplitAmountInputs, editItemAmountInput, updateEditPreview);
    }

    // 🚀 환율 가져오기 로직 유지
    async function fetchAndSetRate(fetchType, currencyFrom, currencyTo, inputEl, previewUpdater, customDateStr = null) {
        if (!currentSettlement) return;
        setLoading(true);
        
        let fetchDate = currentSettlement.date; 
        
        if (fetchType === 'latest') {
            fetchDate = 'latest';
        } else if (fetchType === 'expense' && customDateStr) {
            fetchDate = customDateStr.split('T')[0];
        }

        const rate = await getExchangeRate(fetchDate, currencyFrom, currencyTo);
        
        if (rate !== null && inputEl) { 
            inputEl.value = rate.toFixed(4); 
            if (previewUpdater) previewUpdater(); 
        } else if (rate === null && fetchType === 'expense') {
            showToast('해당 날짜의 환율 정보를 가져오지 못했습니다.', 'error');
        }
        setLoading(false);
    }

    async function handleAddCurrencyChange() {
        if (!currentSettlement) return;
        const currency = itemCurrencySelect.value;
        const base = currentSettlement.base_currency;
        const wrapper = document.getElementById('add-rate-config-wrapper');

        if (currency === base) { if(wrapper) wrapper.classList.add('hidden'); return; }
        if(wrapper) wrapper.classList.remove('hidden');
        
        const fromEl = document.getElementById('add-currency-from'); const toEl = document.getElementById('add-currency-to');
        if(fromEl) fromEl.textContent = currency; if(toEl) toEl.textContent = base;

        const rateInput = document.getElementById('add-custom-rate');
        if (rateInput && !rateInput.value) { await fetchAndSetRate('settlement', currency, base, rateInput, updateAddPreview); } 
        else { updateAddPreview(); }
    }

    function updateAddPreview() {
        if(!itemAmountInput) return;
        const amount = parseFormattedNumber(itemAmountInput.value);
        const rateInput = document.getElementById('add-custom-rate');
        const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;
        const base = currentSettlement ? currentSettlement.base_currency : '';
        const previewEl = document.getElementById('add-converted-total');
        if(previewEl) previewEl.textContent = `${formatNumber(amount * rate, 2)} ${base}`;
    }

    async function handleEditCurrencyChange() {
        if (!currentSettlement) return;
        const currency = editItemCurrencySelect.value;
        const base = currentSettlement.base_currency;
        const wrapper = document.getElementById('edit-rate-config-wrapper');

        if (currency === base) { if(wrapper) wrapper.classList.add('hidden'); return; }
        if(wrapper) wrapper.classList.remove('hidden');
        
        const fromEl = document.getElementById('edit-currency-from'); const toEl = document.getElementById('edit-currency-to');
        if(fromEl) fromEl.textContent = currency; if(toEl) toEl.textContent = base;

        const rateInput = document.getElementById('edit-custom-rate');
        if (rateInput && !rateInput.value) { await fetchAndSetRate('settlement', currency, base, rateInput, updateEditPreview); } 
        else { updateEditPreview(); }
    }

    function updateEditPreview() {
        if(!editItemAmountInput) return;
        const amount = parseFormattedNumber(editItemAmountInput.value);
        const rateInput = document.getElementById('edit-custom-rate');
        const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;
        const base = currentSettlement ? currentSettlement.base_currency : '';
        const previewEl = document.getElementById('edit-converted-total');
        if(previewEl) previewEl.textContent = `${formatNumber(amount * rate, 2)} ${base}`;
    }

    async function createSettlement() {
        const title = newSettlementTitleInput.value.trim();
        const date = newSettlementDateInput.value;
        const participants = getParticipantNamesFromModal();
        const baseCurrency = baseCurrencySelect.value;
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        if (!title || !date || participants.length < 2) { showToast("참가자는 최소 2명 이상이어야 합니다.", "error"); return; }

        setLoading(true);
        const { data, error } = await supabaseClient.from('settlements').insert([{ 
            title, date, participants: participants, base_currency: baseCurrency, is_settled: false, 
            user_id: currentUser ? currentUser.id : null, invite_code: inviteCode
        }]).select('*, expenses (*)');
        setLoading(false);

        if (error) { 
            showToast('정산 생성에 실패했습니다.', 'error'); 
            console.error(error); return; 
        }
        
        showToast('새로운 정산이 생성되었습니다.', 'success');
        const newSettlement = data[0];
        newSettlement.is_host = true; 
        
        settlements.push(newSettlement);
        settlements.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        renderSettlementList(); 
        selectSettlement(newSettlement);
        if(addSettlementModal) addSettlementModal.classList.add('hidden');
        if(newSettlementTitleInput) newSettlementTitleInput.value = ''; 
    }
    
    async function addExpense() {
        if (!currentSettlement) return;
        
        const name = itemNameInput.value.trim();
        const originalAmount = parseFormattedNumber(itemAmountInput.value);
        const currency = itemCurrencySelect.value;
        const expenseDateRaw = itemDateInput.value; 
        
        if (!name || originalAmount <= 0 || !expenseDateRaw) { showToast(getLocale('invalidInput', '올바르게 입력해주세요.'), "error"); return; }
        
        const expenseDate = new Date(expenseDateRaw).toISOString();
        let rate = 1;
        
        if (currency !== currentSettlement.base_currency) {
            const rateInput = document.getElementById('add-custom-rate');
            rate = rateInput ? parseFloat(rateInput.value) : 1;
            if (!rate || rate <= 0) { showToast(getLocale('invalidInput', '올바르게 입력해주세요.'), "error"); return; }
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
            splitAmountInputs.querySelectorAll('input').forEach(inp => {
                const p = inp.dataset.participant; const pAmount = parseFormattedNumber(inp.value);
                sumCheck += pAmount; shares[p] = pAmount * rate;
            });
            if (Math.abs(sumCheck - originalAmount) > 0.01) { showToast(getLocale('amountMismatch', '금액이 일치하지 않습니다.'), "error"); return; }
        }

        setLoading(true);
        const { data, error } = await supabaseClient.from('expenses').insert([{ 
            settlement_id: currentSettlement.id, expense_date: expenseDate, name, original_amount: originalAmount, currency, amount: convertedAmount, payer, split: splitMethod, shares 
        }]).select();
        setLoading(false);

        if (error) { showToast('기록에 실패했습니다.', 'error'); return; }
        
        showToast('지출이 기록되었습니다.', 'success');
        currentSettlement.expenses.push(data[0]);

        if (currentSettlement.is_settled) {
            currentSettlement.is_settled = false;
            await supabaseClient.from('settlements').update({ is_settled: false }).eq('id', currentSettlement.id);
        }
        render(); clearInputs();
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
        } else { editItemDateInput.value = getLocalISOString(); }
        
        editItemCurrencySelect.innerHTML = SUPPORTED_CURRENCIES.map(c => `<option value="${c}" ${c === expense.currency ? 'selected' : ''}>${c}</option>`).join('');
        editItemPayerSelect.value = expense.payer;
        editSplitMethodSelect.value = expense.split;
        
        const rate = (expense.currency !== currentSettlement.base_currency) ? (expense.amount / expense.original_amount) : 1;
        if (expense.currency !== currentSettlement.base_currency) { 
            const rateInput = document.getElementById('edit-custom-rate');
            if(rateInput) rateInput.value = rate.toFixed(4); 
            handleEditCurrencyChange(); 
        } else { 
            const wrapper = document.getElementById('edit-rate-config-wrapper');
            if(wrapper) wrapper.classList.add('hidden'); 
        }
        
        if (expense.split === 'amount') {
            const inputs = editSplitAmountInputs.querySelectorAll('input');
            inputs.forEach(inp => { const p = inp.dataset.participant; const originalShare = (expense.shares[p] || 0) / rate; inp.value = formatNumber(originalShare, 0); });
        } else { editSplitAmountInputs.querySelectorAll('input').forEach(inp => inp.value = ''); }
        
        handleSplitMethodChange(editSplitMethodSelect, editItemAmountInput, editSplitAmountInputs);
        if(editExpenseModal) editExpenseModal.classList.remove('hidden');
    }

    async function handleSaveExpenseChanges() {
        if (!currentSettlement || currentEditingExpenseId === null) return;
        
        const name = editItemNameInput.value.trim();
        const originalAmount = parseFormattedNumber(editItemAmountInput.value);
        const currency = editItemCurrencySelect.value;
        const expenseDateRaw = editItemDateInput.value; 
        
        if (!name || originalAmount <= 0 || !expenseDateRaw) { showToast(getLocale('invalidInput', '올바르게 입력해주세요.'), 'error'); return; }
        const expenseDate = new Date(expenseDateRaw).toISOString();
        let rate = 1;
        
        if (currency !== currentSettlement.base_currency) {
            const rateInput = document.getElementById('edit-custom-rate');
            rate = rateInput ? parseFloat(rateInput.value) : 1;
            if (!rate || rate <= 0) { showToast(getLocale('invalidInput', '올바르게 입력해주세요.'), 'error'); return; }
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
            editSplitAmountInputs.querySelectorAll('input').forEach(inp => {
                const p = inp.dataset.participant; const pAmount = parseFormattedNumber(inp.value);
                sumCheck += pAmount; shares[p] = pAmount * rate;
            });
            if (Math.abs(sumCheck - originalAmount) > 0.01) { showToast(getLocale('amountMismatch', '금액이 일치하지 않습니다.'), 'error'); return; }
        }
        
        setLoading(true);
        const { data, error } = await supabaseClient.from('expenses').update({ 
            expense_date: expenseDate, name, original_amount: originalAmount, currency, amount: convertedAmount, payer, split: splitMethod, shares 
        }).eq('id', currentEditingExpenseId).select();
        setLoading(false);

        if (error) { showToast('저장에 실패했습니다.', 'error'); return; }
        showToast('성공적으로 수정되었습니다.', 'success');
        
        const expenseIndex = currentSettlement.expenses.findIndex(e => e.id === currentEditingExpenseId);
        if (expenseIndex > -1) { currentSettlement.expenses[expenseIndex] = data[0]; }

        if (currentSettlement.is_settled) {
            currentSettlement.is_settled = false;
            await supabaseClient.from('settlements').update({ is_settled: false }).eq('id', currentSettlement.id);
        }
        
        render(); 
        if(editExpenseModal) editExpenseModal.classList.add('hidden'); 
        currentEditingExpenseId = null;
    }
    
    async function deleteExpense(expenseId) {
        if (await showConfirm(getLocale('deleteConfirm', '정말 삭제하시겠습니까?'))) {
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
        }
    }

    async function deleteSettlement(settlementId) {
        if (await showConfirm(getLocale('deleteSettlementConfirm', '정말 방을 삭제하시겠습니까?'))) {
            setLoading(true);
            const { error: settlementError } = await supabaseClient
                .from('settlements')
                .update({ deleted_at: new Date().toISOString() }) 
                .eq('id', settlementId);
            setLoading(false);

            if (settlementError) { showToast('삭제에 실패했습니다. (방장만 삭제 가능합니다)', 'error'); return; }
            showToast('성공적으로 삭제되었습니다.', 'success');
            settlements = settlements.filter(s => s.id !== settlementId);
            if (currentSettlement && currentSettlement.id === settlementId) {
                currentSettlement = null; 
                if(calculatorView) calculatorView.classList.add('hidden'); 
                if(placeholderRightPane) placeholderRightPane.classList.remove('hidden');
                window.history.replaceState({}, '', window.location.pathname); 
            }
            renderSettlementList();
        }
    }

    async function leaveSettlement(settlementId) {
        if (await showConfirm(getLocale('leaveRoomConfirm', '정말 이 방에서 나가시겠습니까?'))) {
            let rooms = getJoinedRooms();
            rooms = rooms.filter(id => id != settlementId);
            localStorage.setItem('joinedRooms', JSON.stringify(rooms));

            showToast('방에서 성공적으로 나갔습니다.', 'success');
            
            settlements = settlements.filter(s => s.id !== settlementId);
            if (currentSettlement && currentSettlement.id === settlementId) {
                currentSettlement = null; 
                if(calculatorView) calculatorView.classList.add('hidden'); 
                if(placeholderRightPane) placeholderRightPane.classList.remove('hidden');
                window.history.replaceState({}, '', window.location.pathname); 
            }
            renderSettlementList();
        }
    }

    function showExpenseExchangeRate(expenseId) {
        if (!currentSettlement) return;
        const expense = currentSettlement.expenses.find(e => e.id === expenseId);
        if (!expense) return;
        const appliedRate = expense.amount / expense.original_amount;
        
        const foreignCurEl = document.getElementById('calc-foreign-currency'); const baseCurEl = document.getElementById('calc-base-currency');
        const baseAmEl = document.getElementById('calc-base-amount'); const totalForEl = document.getElementById('calc-total-foreign');
        const totalBaseEl = document.getElementById('calc-total-base');

        if(foreignCurEl) foreignCurEl.textContent = expense.currency; if(baseCurEl) baseCurEl.textContent = currentSettlement.base_currency;
        if(baseAmEl) baseAmEl.textContent = formatNumber(appliedRate, 4); if(totalForEl) totalForEl.textContent = `${formatNumber(expense.original_amount, 2)} ${expense.currency}`;
        if(totalBaseEl) totalBaseEl.textContent = `${formatNumber(expense.amount, 2)} ${currentSettlement.base_currency}`;
        
        if(expenseRateModal) expenseRateModal.classList.remove('hidden');
    }

    async function showExchangeRateModal() {
        if (!currentSettlement) return;
        const { date, base_currency } = currentSettlement;
        const formattedDate = formatDisplayDate(date); 
        const today = new Date(); today.setHours(0,0,0,0);
        const settlementDate = new Date(formattedDate);
        const isFuture = settlementDate > today;
        
        if(exchangeRateDate) {
            exchangeRateDate.textContent = `${formattedDate} ${getLocale('baseDate', '기준')}`;
            if (isFuture) {
                let futureNotice = "미래 날짜이므로 현재(최신) 환율이 적용되었습니다.";
                exchangeRateDate.innerHTML += `<br><span style="color: var(--danger); font-size: 0.85rem; display: inline-block; margin-top: 0.5rem;"><i class="fas fa-exclamation-triangle"></i> ${futureNotice}</span>`;
            }
        }

        setLoading(true);
        let ratesInfoHTML = `<div class="rate-item"><span class="base">1 ${base_currency}</span> =</div>`;
        const targetCurrencies = SUPPORTED_CURRENCIES.filter(c => c !== base_currency);
        for (const target of targetCurrencies) {
            const rate = await getExchangeRate(date, base_currency, target);
            if (rate !== null) ratesInfoHTML += `<div class="rate-item"><span>${formatNumber(rate, 4)}</span><span>${target}</span></div>`;
        }
        setLoading(false);
        if(exchangeRateInfo) exchangeRateInfo.innerHTML = ratesInfoHTML;
        if(exchangeRateModal) exchangeRateModal.classList.remove('hidden');
    }

    function render() { 
        if (currentSettlement) { 
            currentSettlement.expenses.sort((a, b) => new Date(a.expense_date || a.created_at) - new Date(b.expense_date || b.created_at));
            renderExpenses(); updateSummary(); 
            const isLocked = currentSettlement.is_settled || !currentUser; 
            toggleExpenseForm(isLocked);
        }
    }

    function renderExpenses() {
        if(!expenseTableBody) return;
        expenseTableBody.innerHTML = '';
        if (!currentSettlement || !currentSettlement.expenses) return;
        const participants = currentSettlement.participants;
        
        const isLocked = currentSettlement.is_settled || !currentUser;

        currentSettlement.expenses.forEach(exp => {
            const row = expenseTableBody.insertRow();
            row.dataset.id = exp.id;
            row.classList.toggle('is-settled', isLocked);
            let dateHtml = '';
            if (exp.expense_date) {
                const d = new Date(exp.expense_date);
                let localeCode = currentLang === 'en' ? 'en-US' : (currentLang === 'ja' ? 'ja-JP' : 'ko-KR');
                const dateStr = d.toLocaleDateString(localeCode, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                dateHtml = `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">${dateStr}</div>`;
            }
            let amountHtml = `${formatNumber(exp.original_amount, 2)} ${exp.currency}`;
            if (exp.currency !== currentSettlement.base_currency) { 
                amountHtml = `<span class="clickable-amount" data-id="${exp.id}" title="적용 환율 보기"><i class="fas fa-info-circle"></i> ${amountHtml}</span>`; 
            }
            
            let htmlStr = `<td>${dateHtml}<div>${exp.name}</div></td><td>${amountHtml}</td><td>${exp.payer}</td>`;
            participants.forEach(p => { htmlStr += `<td>${formatNumber(exp.shares[p] || 0, 2)} ${currentSettlement.base_currency}</td>`; });
            htmlStr += `<td><button class="delete-expense-btn" data-id="${exp.id}"><i class="fas fa-trash-alt"></i></button></td>`;
            row.innerHTML = htmlStr;
            
            const clickableAmountSpan = row.querySelector('.clickable-amount');
            if (clickableAmountSpan) { clickableAmountSpan.addEventListener('click', (e) => { e.stopPropagation(); showExpenseExchangeRate(exp.id); }); }
            if (!isLocked) { row.addEventListener('click', (e) => { if (e.target.closest('.delete-expense-btn') || e.target.closest('.clickable-amount')) return; openEditExpenseModal(exp.id); }); }
        });
        
        expenseTableBody.querySelectorAll('.delete-expense-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); deleteExpense(parseInt(e.currentTarget.dataset.id)); });
        });
    }

    function calculateMinimumTransfers(expenses, participants) {
        const balances = {};
        participants.forEach(p => balances[p] = 0);
        expenses.forEach(exp => {
            balances[exp.payer] += (exp.amount || 0);
            participants.forEach(p => { balances[p] -= (exp.shares[p] || 0); });
        });

        let debtors = []; let creditors = []; 
        for (const [person, balance] of Object.entries(balances)) {
            if (balance > 0.01) creditors.push({ person, amount: balance });
            else if (balance < -0.01) debtors.push({ person, amount: Math.abs(balance) });
        }
        
        debtors.sort((a, b) => b.amount - a.amount);
        creditors.sort((a, b) => b.amount - a.amount);

        const transfers = [];
        let i = 0; let j = 0; 
        
        while (i < debtors.length && j < creditors.length) {
            let debtor = debtors[i]; let creditor = creditors[j];
            let amountToTransfer = Math.min(debtor.amount, creditor.amount);
            transfers.push({ from: debtor.person, to: creditor.person, amount: amountToTransfer });
            debtor.amount -= amountToTransfer; creditor.amount -= amountToTransfer;
            if (debtor.amount < 0.01) i++;
            if (creditor.amount < 0.01) j++;
        }
        return { transfers, balances }; 
    }

    function updateSummary() {
        if (!currentSettlement) return;
        const { expenses, participants, base_currency, is_settled } = currentSettlement;
        const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        
        if(totalExpenseP) totalExpenseP.textContent = `${getLocale('totalExpense', 'Total Expense')}: ${formatNumber(totalAmount, 2)} ${base_currency}`;
        if(finalSettlementContainer) finalSettlementContainer.innerHTML = '';
        if(completeSettlementBtn) completeSettlementBtn.classList.add('hidden');

        const { transfers } = calculateMinimumTransfers(expenses, participants);

        if(!finalSettlementContainer || !completeSettlementBtn) return;

        if (is_settled) {
            if (transfers.length === 0) {
                finalSettlementContainer.innerHTML = `<div class="transfer-item">${getLocale('settlementDone', 'Settlement complete')}</div>`;
            } else {
                transfers.forEach(tr => {
                    const div = document.createElement('div');
                    div.className = 'transfer-item';
                    
                    let payButtons = '';
                    if (base_currency === 'KRW' || currentLang === 'ko') {
                        payButtons = `
                            <div style="display:flex; gap:0.5rem; margin-top: 0.8rem;">
                                <a href="supertoss://send?amount=${Math.round(tr.amount)}" style="text-decoration:none; text-align:center; flex:1; font-size:0.9rem; font-weight:600; background-color:#3182f6; color:white; border-radius:8px; padding:0.6rem;"><i class="fas fa-paper-plane"></i> 토스 송금</a>
                                <a href="kakaotalk://kakaopay/home" style="text-decoration:none; text-align:center; flex:1; font-size:0.9rem; font-weight:600; background-color:#FEE500; color:#191919; border-radius:8px; padding:0.6rem;"><i class="fas fa-comment-dollar"></i> 카카오페이</a>
                            </div>
                        `;
                    } else if (base_currency === 'JPY' || currentLang === 'ja') {
                        payButtons = `
                            <div style="display:flex; gap:0.5rem; margin-top: 0.8rem;">
                                <a href="paypay://" style="text-decoration:none; text-align:center; flex:1; font-size:0.9rem; font-weight:600; background-color:#FF0033; color:white; border-radius:8px; padding:0.6rem;">PayPay</a>
                            </div>
                        `;
                    } else {
                        payButtons = `
                            <div style="display:flex; gap:0.5rem; margin-top: 0.8rem;">
                                <a href="venmo://paycharge?txn=pay&amount=${Math.round(tr.amount)}" style="text-decoration:none; text-align:center; flex:1; font-size:0.9rem; font-weight:600; background-color:#008CFF; color:white; border-radius:8px; padding:0.6rem;">Venmo</a>
                                <a href="https://www.paypal.com/myaccount/transfer/homepage" target="_blank" style="text-decoration:none; text-align:center; flex:1; font-size:0.9rem; font-weight:600; background-color:#003087; color:white; border-radius:8px; padding:0.6rem;">PayPal</a>
                            </div>
                        `;
                    }

                    div.innerHTML = `
                        <div style="font-weight: 700; text-align: right; color: white;">
                            ${tr.from} ➡️ ${tr.to} (${formatNumber(tr.amount, 2)} ${base_currency})
                        </div>
                        ${payButtons}
                    `;
                    finalSettlementContainer.appendChild(div);
                });
            }
            if (currentUser) { 
                completeSettlementBtn.textContent = getLocale('editSettlement', 'Reopen Settlement');
                completeSettlementBtn.classList.add('edit-mode'); 
                completeSettlementBtn.classList.remove('hidden');
            }
        } else {
            finalSettlementContainer.innerHTML = `<div class="transfer-item text-muted">${getLocale('settlementInProgress', 'Settlement in progress...')}</div>`;
            if (expenses.length > 0 && currentUser) { 
                completeSettlementBtn.textContent = getLocale('completeSettlement', 'Complete Settlement');
                completeSettlementBtn.classList.remove('edit-mode'); 
                completeSettlementBtn.classList.remove('hidden');
            }
        }
    }

    function toggleExpenseForm(isLocked) { 
        if(!expenseFormCard) return;
        expenseFormCard.classList.toggle('is-settled', isLocked); 
        expenseFormCard.querySelectorAll('input, select, button').forEach(el => { el.disabled = isLocked; }); 
    }
    
    function clearInputs() {
        if(itemNameInput) itemNameInput.value = ''; 
        if(itemAmountInput) itemAmountInput.value = ''; 
        const rateInput = document.getElementById('add-custom-rate');
        if(rateInput) rateInput.value = ''; 
        const wrapper = document.getElementById('add-rate-config-wrapper');
        if(wrapper) wrapper.classList.add('hidden'); 
        if(splitMethodSelect) splitMethodSelect.value = 'equal'; 
        if(itemDateInput) itemDateInput.value = getLocalISOString(); 
        if(splitAmountInputs) splitAmountInputs.querySelectorAll('input').forEach(inp => inp.value = '');
        if(currentSettlement && itemCurrencySelect) { itemCurrencySelect.value = currentSettlement.base_currency; }
        handleSplitMethodChange(splitMethodSelect, itemAmountInput, splitAmountInputs); 
        if(itemNameInput) itemNameInput.focus();
    }

    function attachDynamicSplitInputListeners(container, totalAmountInput, previewUpdater) {
        if(!container) return;
        const inputs = container.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                handleAmountInput(e.target);
                let sum = 0;
                inputs.forEach(inp => sum += parseFormattedNumber(inp.value));
                if(totalAmountInput) totalAmountInput.value = formatNumber(sum, 0);
                if(previewUpdater) previewUpdater();
            });
        });
    }

    function handleAmountInput(inputEl) {
        if(!inputEl) return;
        const value = inputEl.value;
        const hasDecimal = value.includes('.');
        let numericValue = parseFormattedNumber(value);
        if (hasDecimal) {
            const parts = value.split('.');
            inputEl.value = formatNumber(parseFloat(parts[0]), 0) + '.' + (parts[1] || '');
        } else { 
            inputEl.value = formatNumber(numericValue, 0); 
        }
    }

    function handleSplitMethodChange(selectEl, amountEl, splitInputsEl) {
        if(!selectEl || !amountEl || !splitInputsEl) return;
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

    async function copySummaryText() {
        if (!currentSettlement) return;
        const { title, base_currency, expenses, participants } = currentSettlement;
        const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        const { transfers } = calculateMinimumTransfers(expenses, participants);

        const copyTexts = {
            ko: { 
                summary: "정산 요약", total: "총 지출", result: "정산 결과", 
                sendFormat: (from, to, amount, currency) => `${from} ➡️ ${to}에게 ${amount} ${currency} 송금 부탁할게! 💸`, 
                notice: "✅ 아래 링크로 접속하면 [금액이 자동 입력된 토스/카카오페이 송금 버튼]을 사용할 수 있어요!"
            },
            en: { 
                summary: "Settlement Summary", total: "Total Expense", result: "Settlement Result", 
                sendFormat: (from, to, amount, currency) => `${from} ➡️ ${to}: Please send ${amount} ${currency}! 💸`, 
                notice: "✅ Click the link below to use the auto-filled quick transfer buttons!"
            },
            ja: { 
                summary: "精算の概要", total: "総支出", result: "精算結果", 
                sendFormat: (from, to, amount, currency) => `${from} ➡️ ${to}へ ${amount} ${currency} の送金をお願い！ 💸`, 
                notice: "✅ 下のリンクを開くと、金額が自動入力される送金ボタンが使えます！"
            }
        };
        const t = copyTexts[currentLang] || copyTexts['ko'];
        let resultString = '';
        
        if (transfers.length === 0) { 
            resultString = getLocale('settlementDone', 'Settlement complete (No transfers needed)'); 
        } else { 
            resultString = transfers.map(tr => t.sendFormat(tr.from, tr.to, formatNumber(tr.amount, 0), base_currency)).join('\n'); 
        }

        const currentUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${currentUrl}?id=${currentSettlement.id}`;
        
        const text = `🧾 [${title}] ${t.summary}\n\n💰 ${t.total}: ${formatNumber(totalAmount, 0)} ${base_currency}\n🔔 ${t.result}:\n${resultString}\n\n${t.notice}\n${shareUrl}`;
        
        const success = await fallbackCopyTextToClipboard(text);
        if (success) showToast(getLocale('copySuccess', "Copied!"), 'success');
        else showToast('복사에 실패했습니다.', 'error');
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
                height: targetView.scrollHeight,
                filter: (node) => {
                    if (node.tagName === 'LINK' && node.href && node.href.includes('font-awesome')) {
                        return false; 
                    }
                    return true;
                }
            });
            const now = new Date(); 
            const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
            const link = document.createElement('a'); 
            link.download = `SettleUp_${currentSettlement.title}_${timestamp}.png`; 
            link.href = dataUrl; 
            link.click();
            showToast('이미지가 성공적으로 저장되었습니다!', 'success');
        } catch(err) { 
            console.error("이미지 캡처 에러: ", err);
            showToast("이미지 저장에 실패했습니다. (브라우저 보안 설정 때문일 수 있습니다)", 'error'); 
        } finally { 
            targetView.classList.remove('capture-mode'); 
            rightPane.style.overflowY = oldOverflow; 
            setLoading(false); 
        }
    }

    function setupEventListeners() {
        const setCurrentTimeBtn = document.getElementById('set-current-time-btn');
        if(setCurrentTimeBtn) setCurrentTimeBtn.addEventListener('click', () => {
            if(itemDateInput) itemDateInput.value = getLocalISOString();
        });

        const editSetCurrentTimeBtn = document.getElementById('edit-set-current-time-btn');
        if(editSetCurrentTimeBtn) editSetCurrentTimeBtn.addEventListener('click', () => {
            if(editItemDateInput) editItemDateInput.value = getLocalISOString();
        });

        const userInfoDisplay = document.getElementById('user-info-display');
        if(userInfoDisplay) {
            userInfoDisplay.title = getLocale('myPage', '마이페이지');
            userInfoDisplay.addEventListener('click', () => {
                const profileModal = document.getElementById('profile-modal');
                if(profileModal) profileModal.classList.remove('hidden');
            });
        }
        
        const submitChangePasswordBtn = document.getElementById('submit-change-password-btn');
        if(submitChangePasswordBtn) submitChangePasswordBtn.addEventListener('click', async () => {
            const profileNewPassword = document.getElementById('profile-new-password');
            const newPassword = profileNewPassword ? profileNewPassword.value : '';
            if (!newPassword || newPassword.length < 6) {
                showToast(getLocale('invalidInput', '비밀번호는 6자리 이상이어야 합니다.'), 'error');
                return;
            }
            setLoading(true);
            const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
            setLoading(false);
            if (error) {
                showToast(error.message, 'error');
            } else {
                showToast(getLocale('passwordUpdated', '비밀번호가 성공적으로 변경되었습니다.'), 'success');
                if(profileNewPassword) profileNewPassword.value = '';
                const profileModal = document.getElementById('profile-modal');
                if(profileModal) profileModal.classList.add('hidden');
            }
        });

        const deleteAccountBtn = document.getElementById('delete-account-btn');
        if(deleteAccountBtn) deleteAccountBtn.addEventListener('click', async () => {
            if (await showConfirm(getLocale('deleteAccountConfirm', '정말로 탈퇴하시겠습니까? 복구할 수 없습니다.'))) {
                setLoading(true);
                const { error } = await supabaseClient.rpc('delete_user');
                setLoading(false);
                
                if (error) {
                    showToast('회원 탈퇴 실패 (관리자가 SQL 설정을 했는지 확인해주세요)', 'error');
                    console.error("delete_user RPC error:", error);
                } else {
                    showToast(getLocale('accountDeletedSuccess', '회원 탈퇴가 완료되었습니다.'), 'success');
                    await supabaseClient.auth.signOut();
                    window.location.replace('login.html');
                }
            }
        });

        if(languageSwitcher) languageSwitcher.addEventListener('change', (e) => setLanguage(e.target.value));
        if(mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
        if(authBtn) authBtn.addEventListener('click', handleAuthClick); 

        if(settlementSearchInput) {
            settlementSearchInput.addEventListener('input', () => {
                renderSettlementList();
            });
        }

        if(addSettlementFab) addSettlementFab.addEventListener('click', () => {
            const dateInput = document.getElementById('new-settlement-date');
            if(dateInput) dateInput.value = getLocalDateString();
            renderParticipantInputs(2);
            if(addSettlementModal) addSettlementModal.classList.remove('hidden');
            const titleInput = document.getElementById('new-settlement-title');
            if(titleInput) titleInput.focus();
        });

        if(joinRoomBtn) joinRoomBtn.addEventListener('click', async () => {
            if (!currentSettlement) return;
            
            if (!currentUser) { 
                if (await showConfirm(getLocale('loginToSave', '내 목록에 저장하려면 로그인이 필요합니다.\n로그인 화면으로 이동하시겠습니까?'))) {
                    window.location.href = 'login.html';
                }
                return;
            }

            saveJoinedRoom(currentSettlement.id);
            joinRoomBtn.classList.add('hidden');
            showToast('내 정산 목록에 저장되었습니다!', 'success');
            loadData(); 
        });

        const openShareModalBtn = document.getElementById('open-share-modal-btn');
        if(openShareModalBtn) openShareModalBtn.addEventListener('click', openShareModal);
        
        const copyShareLinkBtn = document.getElementById('copy-share-link-btn');
        if(copyShareLinkBtn) copyShareLinkBtn.addEventListener('click', () => {
            fallbackCopyTextToClipboard(document.getElementById('share-link-input').value);
            showToast('링크가 복사되었습니다.', 'success');
        });

        const copyShareCodeBtn = document.getElementById('copy-share-code-btn');
        if(copyShareCodeBtn) copyShareCodeBtn.addEventListener('click', () => {
            fallbackCopyTextToClipboard(document.getElementById('share-code-input').value);
            showToast('초대 코드가 복사되었습니다.', 'success');
        });

        const shareEmailBtn = document.getElementById('share-email-btn');
        if(shareEmailBtn) shareEmailBtn.addEventListener('click', sendEmailInvite);

        const openJoinModalBtn = document.getElementById('open-join-modal-btn');
        if(openJoinModalBtn) openJoinModalBtn.addEventListener('click', () => {
            const joinModal = document.getElementById('join-modal');
            if(joinModal) joinModal.classList.remove('hidden');
        });

        const submitJoinCodeBtn = document.getElementById('submit-join-code-btn');
        if(submitJoinCodeBtn) submitJoinCodeBtn.addEventListener('click', joinRoomByCode);
        
        const joinCodeInput = document.getElementById('join-code-input');
        if(joinCodeInput) joinCodeInput.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') joinRoomByCode();
        });

        if(copyTextBtn) copyTextBtn.addEventListener('click', copySummaryText);
        if(saveImageBtn) saveImageBtn.addEventListener('click', saveAsImage);

        if(addParticipantBtn) addParticipantBtn.addEventListener('click', () => addParticipantInputUI());
        
        if(editSettlementTitleBtn) {
            editSettlementTitleBtn.addEventListener('click', () => {
                if(!currentSettlement) return;
                if(editTitleInput) editTitleInput.value = currentSettlement.title;
                if(editTitleModal) editTitleModal.classList.remove('hidden');
            });
        }

        if(saveTitleBtn) {
            saveTitleBtn.addEventListener('click', async () => {
                if(!currentSettlement) return;
                const newTitle = editTitleInput ? editTitleInput.value.trim() : '';
                if(!newTitle) {
                    showToast(getLocale('invalidInput', '올바르게 입력해주세요.'), 'error');
                    return;
                }

                setLoading(true);
                const { error } = await supabaseClient.from('settlements').update({ title: newTitle }).eq('id', currentSettlement.id);
                setLoading(false);

                if(error) {
                    showToast('제목 수정에 실패했습니다.', 'error');
                    return;
                }

                showToast('제목이 수정되었습니다.', 'success');
                currentSettlement.title = newTitle;
                
                const sIndex = settlements.findIndex(s => s.id === currentSettlement.id);
                if(sIndex > -1) settlements[sIndex].title = newTitle;
                
                if(settlementDisplay) settlementDisplay.textContent = newTitle;
                renderSettlementList();
                updateOpenGraphTags(currentSettlement); 
                if(editTitleModal) editTitleModal.classList.add('hidden');
            });
        }

        [addSettlementModal, exchangeRateModal, editExpenseModal, expenseRateModal, document.getElementById('share-modal'), document.getElementById('join-modal'), document.getElementById('profile-modal'), editTitleModal].forEach(modal => {
            if(modal) {
                modal.addEventListener('click', (e) => { 
                    if (e.target === modal) modal.classList.add('hidden'); 
                });
                const closeBtn = modal.querySelector('.close-modal-btn');
                if(closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
            }
        });

        if(createSettlementBtn) createSettlementBtn.addEventListener('click', createSettlement);
        if(addExpenseBtn) addExpenseBtn.addEventListener('click', addExpense);
        if(saveExpenseChangesBtn) saveExpenseChangesBtn.addEventListener('click', handleSaveExpenseChanges);
        if(exchangeRateInfoBtn) exchangeRateInfoBtn.addEventListener('click', showExchangeRateModal);
        
        // 🚀 지출 환율 관련 이벤트 리스너 복구 확인 완료
        if(itemCurrencySelect) itemCurrencySelect.addEventListener('change', () => { 
            const rateInput = document.getElementById('add-custom-rate');
            if(rateInput) rateInput.value = ''; 
            handleAddCurrencyChange(); 
        });
        if(itemAmountInput) itemAmountInput.addEventListener('input', () => { 
            handleAmountInput(itemAmountInput); 
            updateAddPreview(); 
        });
        
        const addCustomRate = document.getElementById('add-custom-rate');
        if(addCustomRate) addCustomRate.addEventListener('input', updateAddPreview);
        const addSettleRateBtn = document.getElementById('add-settlement-rate-btn');
        if(addSettleRateBtn) addSettleRateBtn.addEventListener('click', () => { 
            fetchAndSetRate('settlement', itemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('add-custom-rate'), updateAddPreview); 
        });
        const addLiveRateBtn = document.getElementById('add-live-rate-btn');
        if(addLiveRateBtn) addLiveRateBtn.addEventListener('click', () => { 
            fetchAndSetRate('latest', itemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('add-custom-rate'), updateAddPreview); 
        });

        // 🚀 지출 추가 폼의 '지출일' 버튼
        const addExpenseRateBtn = document.getElementById('add-expense-rate-btn');
        if(addExpenseRateBtn) addExpenseRateBtn.addEventListener('click', () => { 
            const expDate = document.getElementById('item-date').value;
            if(!expDate) return showToast(getLocale('invalidInput', '지출 일시를 먼저 입력해주세요.'), 'error');
            fetchAndSetRate('expense', itemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('add-custom-rate'), updateAddPreview, expDate); 
        });

        if(editItemCurrencySelect) editItemCurrencySelect.addEventListener('change', () => { 
            const editRateInput = document.getElementById('edit-custom-rate');
            if(editRateInput) editRateInput.value = ''; 
            handleEditCurrencyChange(); 
        });
        if(editItemAmountInput) editItemAmountInput.addEventListener('input', () => { 
            handleAmountInput(editItemAmountInput); 
            updateEditPreview(); 
        });
        
        const editCustomRate = document.getElementById('edit-custom-rate');
        if(editCustomRate) editCustomRate.addEventListener('input', updateEditPreview);
        const editSettleRateBtn = document.getElementById('edit-settlement-rate-btn');
        if(editSettleRateBtn) editSettleRateBtn.addEventListener('click', () => { 
            fetchAndSetRate('settlement', editItemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('edit-custom-rate'), updateEditPreview); 
        });
        const editLiveRateBtn = document.getElementById('edit-live-rate-btn');
        if(editLiveRateBtn) editLiveRateBtn.addEventListener('click', () => { 
            fetchAndSetRate('latest', editItemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('edit-custom-rate'), updateEditPreview); 
        });

        // 🚀 지출 수정 폼의 '지출일' 버튼
        const editExpenseRateBtn = document.getElementById('edit-expense-rate-btn');
        if(editExpenseRateBtn) editExpenseRateBtn.addEventListener('click', () => { 
            const expDate = document.getElementById('edit-item-date').value;
            if(!expDate) return showToast(getLocale('invalidInput', '지출 일시를 먼저 입력해주세요.'), 'error');
            fetchAndSetRate('expense', editItemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('edit-custom-rate'), updateEditPreview, expDate); 
        });

        if(completeSettlementBtn) completeSettlementBtn.addEventListener('click', async () => {
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
        
        if(splitMethodSelect) splitMethodSelect.addEventListener('change', () => handleSplitMethodChange(splitMethodSelect, itemAmountInput, splitAmountInputs));
        if(editSplitMethodSelect) editSplitMethodSelect.addEventListener('change', () => handleSplitMethodChange(editSplitMethodSelect, editItemAmountInput, editSplitAmountInputs));
        if(downloadExcelBtn) downloadExcelBtn.addEventListener('click', downloadExcel);
    }

    function downloadExcel() {
        if (!currentSettlement || currentSettlement.expenses.length === 0) { 
            showToast(getLocale('noDataToExport', 'No expense data to export.'), 'error'); 
            return; 
        }
        const { title, participants, expenses, base_currency } = currentSettlement;
        const dataForExport = [];
        
        const header = [ 
            getLocale('tableHeaderDate', 'Date'), 
            getLocale('tableHeaderItem', 'Item'), 
            getLocale('tableHeaderTotal', 'Total Amount'), 
            getLocale('tableHeaderPayer', 'Payer') 
        ];
        participants.forEach(p => header.push((getLocale('shareOf', '{name} Share')).replace('{name}', p)));

        const appName = getLocale('appTitle', 'Settle Up').split('|')[0].trim();
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
        const { transfers } = calculateMinimumTransfers(expenses, participants);

        const totalsRow = [ '', getLocale('totalExpense', '총 지출'), `${formatNumber(totalAmount, 2)} ${base_currency}`, '' ];
        participants.forEach(p => totalsRow.push(`${formatNumber(participantTotals[p], 2)} ${base_currency}`));
        dataForExport.push(totalsRow); 
        dataForExport.push([]); 
        
        const resultTitleRowIndex = dataForExport.length; 
        const resultTitleRow = new Array(header.length).fill('');
        resultTitleRow[0] = getLocale('settlementResult', '정산 결과');
        dataForExport.push(resultTitleRow);

        if (transfers.length === 0) {
            const doneRow = new Array(header.length).fill(''); 
            doneRow[0] = getLocale('settlementDone', '정산이 완료되었습니다. (송금 필요 없음)'); 
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
                for (let char of cellValue) { length += char.charCodeAt(0) > 255 ? 2.1 : 1.1; }
                const cellWidth = Math.max(12, Math.ceil(length) + 2); 
                if (!colWidths[i] || colWidths[i] < cellWidth) { colWidths[i] = cellWidth; }
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
                if (R === 0) { ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { sz: 16, bold: true, color: { rgb: "4F46E5" } }, fill: { fgColor: { rgb: "EEF2FF" } } }; }
                else if (R === 1) { ws[cell_ref].s = { font: { bold: true, color: { rgb: "64748B" } }, alignment: { horizontal: C === header.length - 1 ? "right" : "left", vertical: "center" } }; }
                else if (R === headerRowIdx) { ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } }; }
                else if (R === totalRowIdx) { ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } } }; }
                else if (R === resultTitleRowIndex) { if (C <= 1) ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "6366F1" } } }; }
                else if (R > resultTitleRowIndex) { if (C === 0 || C === 1) ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true, sz: 12, color: { rgb: "1E293B" } } }; }
                else if (R > 3 && R < totalRowIdx) { ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" } }; }
            }
        }
    
        XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
        XLSX.writeFile(wb, `${getLocale('expenseReport', 'Expense_Report')}_${title}_${timestamp}.xlsx`, { cellStyles: true });
        showToast('엑셀 파일이 다운로드되었습니다.', 'success');
    }

    initialize();
});
// ======= 파일의 끝입니다 =======