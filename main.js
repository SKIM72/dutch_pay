document.addEventListener('DOMContentLoaded', () => {

    // --- Global State ---
    let settlements = {};
    let currentSettlement = null;
    let currentLang = 'ko';

    // --- Element References ---
    const languageSwitcher = document.getElementById('language-switcher');
    const sidebar = document.getElementById('left-pane');
    const appTitle = document.querySelector('header h1');
    const mainDatePicker = document.getElementById('main-date-picker');
    const settlementListContainer = document.getElementById('settlement-list-container');
    const addSettlementFab = document.getElementById('add-settlement-fab');
    const placeholderRightPane = document.getElementById('placeholder-right-pane');
    const calculatorView = document.getElementById('calculator');
    const addSettlementModal = document.getElementById('add-settlement-modal');
    const modalDateDisplay = document.getElementById('modal-date-display');
    const newSettlementTitleInput = document.getElementById('new-settlement-title');
    const newParticipantAInput = document.getElementById('new-participant-a');
    const newParticipantBInput = document.getElementById('new-participant-b');
    const createSettlementBtn = document.getElementById('create-settlement-btn');
    const closeModalBtn = document.querySelector('.close-modal-btn');
    const settlementDisplay = document.getElementById('settlement-display');
    const settlementDateBadge = document.getElementById('settlement-date-badge');
    const itemPayerSelect = document.getElementById('item-payer');
    const splitMethodSelect = document.getElementById('split-method');
    const splitAmountAInput = document.getElementById('split-amount-a');
    const splitAmountBInput = document.getElementById('split-amount-b');
    const expenseTableBody = document.querySelector('#expense-table tbody');
    const totalExpenseP = document.getElementById('total-expense');
    const finalSettlementP = document.getElementById('final-settlement');
    const completeSettlementBtn = document.getElementById('complete-settlement-btn');
    const downloadExcelBtn = document.getElementById('download-excel-btn');
    const addExpenseBtn = document.getElementById('add-expense-btn');
    const itemNameInput = document.getElementById('item-name');
    const itemAmountInput = document.getElementById('item-amount');
    const splitAmountInputs = document.getElementById('split-amount-inputs');

    // --- Utility Functions ---
    const formatNumber = (num) => isNaN(num) ? '0' : num.toLocaleString('en-US');
    const parseFormattedNumber = (str) => parseFloat(String(str).replace(/,/g, '')) || 0;

    // --- i18n (Localization) ---
    function updateUI(lang) {
        currentLang = lang;
        const translations = locales[lang];
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.innerHTML = translations[key] || el.innerHTML;
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = translations[key] || el.placeholder;
        });
        
        document.querySelectorAll('[data-i18n-options]').forEach(el => {
            const keys = el.getAttribute('data-i18n-options').split(',');
            el.innerHTML = ''; // Clear existing options
            keys.forEach(key => {
                const option = document.createElement('option');
                const value = key.trim();
                if (value === 'splitEqually') option.value = 'equal';
                else if (value === 'splitByAmount') option.value = 'amount';
                option.textContent = translations[value];
                el.appendChild(option);
            });
        });
        
        if (currentSettlement) {
            updateParticipantNames(currentSettlement.participants);
            updateSummary();
            renderExpenses();
        }
        renderSettlementList(mainDatePicker.value);
    }

    function setLanguage(lang) {
        localStorage.setItem('preferredLang', lang);
        languageSwitcher.value = lang;
        updateUI(lang);
    }

    // --- Initialization ---
    function initialize() {
        const preferredLang = localStorage.getItem('preferredLang');
        const browserLang = navigator.language.split('-')[0];
        const initialLang = preferredLang || (['ko', 'en', 'ja'].includes(browserLang) ? browserLang : 'en');
        
        setupEventListeners();
        setInitialDate();     
        setLanguage(initialLang);
    }

    function setInitialDate() {
        const todayString = new Date().toLocaleDateString('fr-CA', { timeZone: 'Asia/Tokyo' });
        mainDatePicker.value = todayString;
        mainDatePicker.dispatchEvent(new Event('change'));
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        languageSwitcher.addEventListener('change', (e) => setLanguage(e.target.value));
        appTitle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
        mainDatePicker.addEventListener('change', () => renderSettlementList(mainDatePicker.value));
        addSettlementFab.addEventListener('click', () => {
            modalDateDisplay.textContent = mainDatePicker.value;
            addSettlementModal.classList.remove('hidden');
            newSettlementTitleInput.focus();
        });
        closeModalBtn.addEventListener('click', closeModal);
        addSettlementModal.addEventListener('click', (e) => { if (e.target.id === 'add-settlement-modal') closeModal(); });
        createSettlementBtn.addEventListener('click', createSettlement);
        addExpenseBtn.addEventListener('click', addExpense);
        completeSettlementBtn.addEventListener('click', () => {
            if(currentSettlement) {
                currentSettlement.isSettled = true;
                updateSummary();
            }
        });
        
        splitMethodSelect.addEventListener('change', handleSplitMethodChange);

        [itemAmountInput, splitAmountAInput, splitAmountBInput].forEach(input => {
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                const numericValue = parseFormattedNumber(value);
                e.target.value = formatNumber(numericValue);
            });
        });

        [splitAmountAInput, splitAmountBInput].forEach(input => {
            input.addEventListener('input', () => {
                 if (splitMethodSelect.value === 'amount') {
                    const amountA = parseFormattedNumber(splitAmountAInput.value);
                    const amountB = parseFormattedNumber(splitAmountBInput.value);
                    itemAmountInput.value = formatNumber(amountA + amountB);
                 }
            });
        });

        downloadExcelBtn.addEventListener('click', downloadExcel);
    }

    function handleSplitMethodChange() {
        const isManualAmount = splitMethodSelect.value === 'amount';
        splitAmountInputs.classList.toggle('hidden', !isManualAmount);
        itemAmountInput.readOnly = isManualAmount;
        if (isManualAmount) {
            const amountA = parseFormattedNumber(splitAmountAInput.value);
            const amountB = parseFormattedNumber(splitAmountBInput.value);
            itemAmountInput.value = formatNumber(amountA + amountB);
        } else {
             itemAmountInput.value = ''; // Clear main amount when switching back to 1/N
        }
    }

    function closeModal() { addSettlementModal.classList.add('hidden'); }

    // --- Settlement Management ---
    function createSettlement() {
        const title = newSettlementTitleInput.value.trim();
        const date = mainDatePicker.value;
        const participantA = newParticipantAInput.value.trim() || 'A';
        const participantB = newParticipantBInput.value.trim() || 'B';

        if (!title || !date) return;
        if (!settlements[date]) settlements[date] = [];
        const newSettlement = { id: Date.now(), title, date, participants: [participantA, participantB], expenses: [], isSettled: false };
        settlements[date].push(newSettlement);
        renderSettlementList(date);
        selectSettlement(newSettlement);
        closeModal();
        newSettlementTitleInput.value = '';
        newParticipantAInput.value = 'A'; newParticipantBInput.value = 'B';
    }
    
    function deleteSettlement(date, settlementId) {
        if (confirm(locales[currentLang]?.deleteSettlementConfirm)) {
            settlements[date] = settlements[date].filter(s => s.id !== settlementId);
            if (currentSettlement && currentSettlement.id === settlementId) {
                currentSettlement = null;
                calculatorView.classList.add('hidden');
                placeholderRightPane.classList.remove('hidden');
            }
            renderSettlementList(date);
        }
    }

    function selectSettlement(settlement) {
        currentSettlement = settlement;
        placeholderRightPane.classList.add('hidden');
        calculatorView.classList.remove('hidden');
        settlementDisplay.textContent = settlement.title;
        settlementDateBadge.textContent = settlement.date;
        updateParticipantNames(settlement.participants);
        document.querySelectorAll('.settlement-item').forEach(item => item.classList.toggle('active', item.dataset.id == settlement.id));
        if (window.innerWidth <= 768) sidebar.classList.add('collapsed');
        render();
    }

    function renderSettlementList(date) {
        const list = settlements[date] || [];
        settlementListContainer.innerHTML = list.length === 0 
            ? `<p class="subtitle" style="padding: 0; font-size: 0.9rem; color: var(--text-muted); text-align: center;">${locales[currentLang]?.noHistory}</p>`
            : list.map(s => `
                <div class="settlement-item-wrapper">
                    <button class="settlement-item" data-id="${s.id}">
                        <div>
                            <span class="item-title">${s.title}</span>
                            <span class="item-participants">(${s.participants.join(', ')})</span>
                        </div>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <button class="delete-settlement-btn" data-date="${date}" data-id="${s.id}"><i class="fas fa-trash-alt"></i></button>
                </div>`).join('');
        
        settlementListContainer.querySelectorAll('.settlement-item').forEach(btn => btn.addEventListener('click', (e) => selectSettlement(list.find(s => s.id == e.currentTarget.dataset.id))));
        settlementListContainer.querySelectorAll('.delete-settlement-btn').forEach(btn => btn.addEventListener('click', (e) => deleteSettlement(e.currentTarget.dataset.date, parseInt(e.currentTarget.dataset.id))));
    }

    function updateParticipantNames(participants) {
        const [userA, userB] = participants;
        itemPayerSelect.innerHTML = `<option value="${userA}">${locales[currentLang]?.paidBy.replace('{payer}', userA)}</option><option value="${userB}">${locales[currentLang]?.paidBy.replace('{payer}', userB)}</option>`;
        const shareOfString = locales[currentLang]?.shareOf;
        document.getElementById('table-header-user-a').textContent = shareOfString.replace('{name}', userA);
        document.getElementById('table-header-user-b').textContent = shareOfString.replace('{name}', userB);
        splitAmountAInput.placeholder = shareOfString.replace('{name}', userA);
        splitAmountBInput.placeholder = shareOfString.replace('{name}', userB);
    }

    // --- Expense Management ---
    function addExpense() {
        if (!currentSettlement) return;
        const name = itemNameInput.value.trim();
        let totalAmount = parseFormattedNumber(itemAmountInput.value);
        if (!name || totalAmount <= 0) { alert('Invalid input'); return; }

        const [userA, userB] = currentSettlement.participants;
        const payer = itemPayerSelect.value;
        const splitMethod = splitMethodSelect.value;
        let shares = { [userA]: 0, [userB]: 0 };

        if (splitMethod === 'equal') {
            shares[userA] = shares[userB] = totalAmount / 2;
        } else if (splitMethod === 'amount') {
            shares[userA] = parseFormattedNumber(splitAmountAInput.value);
            shares[userB] = parseFormattedNumber(splitAmountBInput.value);
            if (Math.abs(shares[userA] + shares[userB] - totalAmount) > 0.01) {
                alert('Amounts must sum to total'); return;
            }
        }

        currentSettlement.expenses.push({ id: Date.now(), name, amount: totalAmount, payer, split: splitMethod, shares });
        currentSettlement.isSettled = false; // Re-open settlement
        render();
        clearInputs();
    }
    
    function deleteExpense(expenseId) {
        if (confirm(locales[currentLang]?.deleteConfirm)) {
            currentSettlement.expenses = currentSettlement.expenses.filter(exp => exp.id !== expenseId);
            currentSettlement.isSettled = false; // Re-open settlement
            render();
        }
    }

    function render() { if (currentSettlement) { renderExpenses(); updateSummary(); } }

    function renderExpenses() {
        expenseTableBody.innerHTML = '';
        if (!currentSettlement || !currentSettlement.expenses) return;
        const [userA, userB] = currentSettlement.participants;
        currentSettlement.expenses.forEach(exp => {
            const row = expenseTableBody.insertRow();
            row.innerHTML = `
                <td>${exp.name}</td>
                <td>${formatNumber(exp.amount)}</td>
                <td>${exp.payer}</td>
                <td>${formatNumber(Math.round(exp.shares[userA]))}</td>
                <td>${formatNumber(Math.round(exp.shares[userB]))}</td>
                <td><button class="delete-expense-btn" data-id="${exp.id}"><i class="fas fa-trash-alt"></i></button></td>
            `;
        });
        expenseTableBody.querySelectorAll('.delete-expense-btn').forEach(btn => 
            btn.addEventListener('click', (e) => deleteExpense(parseInt(e.currentTarget.dataset.id)))
        );
    }
    
    function updateSummary() {
        if (!currentSettlement) return;
        const { expenses, participants, isSettled } = currentSettlement;
        const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        totalExpenseP.textContent = `${locales[currentLang]?.totalExpense}: ${formatNumber(totalAmount)} JPY`;

        finalSettlementP.textContent = '';
        completeSettlementBtn.classList.add('hidden');

        if (isSettled) {
            const [userA, userB] = participants;
            const amountPaidByA = expenses.filter(exp => exp.payer === userA).reduce((sum, exp) => sum + exp.amount, 0);
            const totalOwedByA = expenses.reduce((sum, exp) => sum + exp.shares[userA], 0);
            const balanceA = amountPaidByA - totalOwedByA;

            let settlementText = locales[currentLang]?.settlementDone;
            const paysToString = ` ${locales[currentLang]?.paysTo} `;
            if (balanceA > 0.01) settlementText = `${userB}${paysToString}${userA}: ${formatNumber(Math.round(balanceA))} JPY`;
            else if (balanceA < -0.01) settlementText = `${userA}${paysToString}${userB}: ${formatNumber(Math.round(Math.abs(balanceA)))} JPY`;
            finalSettlementP.textContent = settlementText;
        } else if (expenses.length > 0) {
            finalSettlementP.textContent = locales[currentLang]?.settlementInProgress;
            completeSettlementBtn.classList.remove('hidden');
        }
    }

    function clearInputs() {
        itemNameInput.value = ''; itemAmountInput.value = '';
        splitAmountAInput.value = ''; splitAmountBInput.value = '';
        splitMethodSelect.value = 'equal';
        handleSplitMethodChange();
        itemNameInput.focus();
    }

    function downloadExcel() {
        if (!currentSettlement) return;
        // ... (Excel download logic remains the same)
    }

    // --- Start the App ---
    initialize();
});