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
    const downloadExcelBtn = document.getElementById('download-excel-btn');
    const addExpenseBtn = document.getElementById('add-expense-btn');
    const itemNameInput = document.getElementById('item-name');
    const itemAmountInput = document.getElementById('item-amount');
    const splitAmountInputs = document.getElementById('split-amount-inputs');

    // --- i18n (Localization) ---
    function updateUI(lang) {
        currentLang = lang;
        const translations = locales[lang];
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[key]) {
                el.innerHTML = translations[key];
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[key]) {
                el.placeholder = translations[key];
            }
        });
        
        document.querySelectorAll('[data-i18n-options]').forEach(el => {
            const keys = el.getAttribute('data-i18n-options').split(',');
            el.querySelectorAll('option').forEach((opt, index) => {
                if(keys[index] && translations[keys[index]]) {
                     opt.textContent = translations[keys[index]];
                }
            });
        });
        
        // Special cases that need re-rendering
        if (currentSettlement) {
            updateParticipantNames(currentSettlement.participants);
            updateSummary();
            renderExpenses(); // Re-render expenses for language change on buttons etc.
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
        mainDatePicker.addEventListener('change', () => {
            const selectedDate = mainDatePicker.value;
            if (selectedDate) {
                renderSettlementList(selectedDate);
                addSettlementFab.classList.remove('hidden');
            } else {
                settlementListContainer.innerHTML = '';
                addSettlementFab.classList.add('hidden');
            }
        });
        addSettlementFab.addEventListener('click', () => {
            modalDateDisplay.textContent = mainDatePicker.value;
            addSettlementModal.classList.remove('hidden');
            newSettlementTitleInput.focus();
        });
        closeModalBtn.addEventListener('click', closeModal);
        addSettlementModal.addEventListener('click', (e) => { if (e.target.id === 'add-settlement-modal') closeModal(); });
        createSettlementBtn.addEventListener('click', createSettlement);
        addExpenseBtn.addEventListener('click', addExpense);
        splitMethodSelect.addEventListener('change', () => {
            splitAmountInputs.classList.toggle('hidden', splitMethodSelect.value !== 'amount');
        });
        downloadExcelBtn.addEventListener('click', downloadExcel);
    }

    function closeModal() { addSettlementModal.classList.add('hidden'); }

    // --- Settlement Management ---
    function createSettlement() {
        const title = newSettlementTitleInput.value.trim();
        const date = mainDatePicker.value;
        const participantA = newParticipantAInput.value.trim() || 'Participant 1';
        const participantB = newParticipantBInput.value.trim() || 'Participant 2';

        if (title && date) {
            if (!settlements[date]) settlements[date] = [];
            const newSettlement = { id: Date.now(), title, date, participants: [participantA, participantB], expenses: [] };
            settlements[date].push(newSettlement);
            renderSettlementList(date);
            selectSettlement(newSettlement);
            closeModal();
            newSettlementTitleInput.value = '';
            newParticipantAInput.value = 'Participant 1';
            newParticipantBInput.value = 'Participant 2';
        }
    }

    function selectSettlement(settlement) {
        currentSettlement = settlement;
        placeholderRightPane.classList.add('hidden');
        calculatorView.classList.remove('hidden');
        settlementDisplay.textContent = settlement.title;
        settlementDateBadge.textContent = settlement.date;
        updateParticipantNames(settlement.participants);
        document.querySelectorAll('.settlement-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id == settlement.id);
        });
        if (window.innerWidth > 768) sidebar.classList.add('collapsed');
        render();
    }

    function renderSettlementList(date) {
        settlementListContainer.innerHTML = '';
        const dailySettlements = settlements[date] || [];
        if (dailySettlements.length === 0) {
            const noHistoryText = locales[currentLang]?.noHistory || 'No History';
            settlementListContainer.innerHTML = `<p class="subtitle" style="padding: 0 1rem; font-size: 0.9rem; color: var(--text-muted);">${noHistoryText}</p>`;
        } else {
            dailySettlements.forEach(s => {
                const item = document.createElement('button');
                item.className = 'settlement-item';
                item.dataset.id = s.id;
                item.innerHTML = `<span>${s.title} (${s.participants.join(', ')})</span><i class="fas fa-chevron-right"></i>`;
                item.addEventListener('click', () => selectSettlement(s));
                settlementListContainer.appendChild(item);
            });
        }
    }

    function updateParticipantNames(participants) {
        const [userA, userB] = participants;
        const paidByString = locales[currentLang]?.paidBy || '{payer} paid';
        itemPayerSelect.innerHTML = `<option value="${userA}">${paidByString.replace('{payer}', userA)}</option><option value="${userB}">${paidByString.replace('{payer}', userB)}</option>`;
        
        const shareOfString = locales[currentLang]?.shareOf || "{name}'s Share";
        document.getElementById('table-header-user-a').textContent = shareOfString.replace('{name}', userA);
        document.getElementById('table-header-user-b').textContent = shareOfString.replace('{name}', userB);
        splitAmountAInput.placeholder = shareOfString.replace('{name}', userA);
        splitAmountBInput.placeholder = shareOfString.replace('{name}', userB);
    }

    // --- Expense Management ---
    function addExpense() {
        if (!currentSettlement) return;
        const [userA, userB] = currentSettlement.participants;
        const name = itemNameInput.value.trim();
        const totalAmount = parseFloat(itemAmountInput.value);
        const payer = itemPayerSelect.value;
        const splitMethod = splitMethodSelect.value;

        if (!name || isNaN(totalAmount) || totalAmount <= 0) { alert('Invalid input'); return; }

        let shares = {}, isValid = true;
        shares[userA] = 0; shares[userB] = 0;

        switch (splitMethod) {
            case 'equal':
                shares[userA] = totalAmount / 2; shares[userB] = totalAmount / 2;
                break;
            case 'percent':
                const promptText = (locales[currentLang]?.promptPayerShare || '{name} share (%):').replace('{name}', userA);
                const percentA = parseFloat(prompt(promptText, '50'));
                if (isNaN(percentA) || percentA < 0 || percentA > 100) { isValid = false; break; }
                shares[userA] = totalAmount * (percentA / 100);
                shares[userB] = totalAmount - shares[userA];
                break;
            case 'amount':
                const amountA = parseFloat(splitAmountAInput.value);
                const amountB = parseFloat(splitAmountBInput.value);
                if (isNaN(amountA) || isNaN(amountB) || Math.abs(amountA + amountB - totalAmount) > 0.01) { alert('Amounts must sum to total'); isValid = false; break; }
                shares[userA] = amountA; shares[userB] = amountB;
                break;
        }

        if (isValid) {
            const expenseId = Date.now(); // Create a unique ID for the expense
            currentSettlement.expenses.push({ id: expenseId, name, amount: totalAmount, payer, split: splitMethod, shares });
            render();
            clearInputs();
        }
    }
    
    function deleteExpense(expenseId) {
        const confirmMessage = locales[currentLang]?.deleteConfirm || 'Are you sure?';
        if (confirm(confirmMessage)) {
            currentSettlement.expenses = currentSettlement.expenses.filter(exp => exp.id !== expenseId);
            render();
        }
    }

    function render() { if (currentSettlement) { renderExpenses(); updateSummary(); } }

    function renderExpenses() {
        expenseTableBody.innerHTML = '';
        const [userA, userB] = currentSettlement.participants;
        currentSettlement.expenses.forEach(exp => {
            const row = expenseTableBody.insertRow();
            row.innerHTML = `
                <td>${exp.name}</td>
                <td>${exp.amount.toLocaleString()}</td>
                <td>${exp.payer}</td>
                <td>${Math.round(exp.shares[userA]).toLocaleString()}</td>
                <td>${Math.round(exp.shares[userB]).toLocaleString()}</td>
                <td><button class="delete-expense-btn"><i class="fas fa-trash-alt"></i></button></td>
            `;
            const deleteBtn = row.querySelector('.delete-expense-btn');
            deleteBtn.addEventListener('click', () => deleteExpense(exp.id));
        });
    }
    
    function updateSummary() {
        if (!currentSettlement) return;
        const { expenses, participants } = currentSettlement;
        const [userA, userB] = participants;
        const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const totalOwedByA = expenses.reduce((sum, exp) => sum + exp.shares[userA], 0);
        const amountPaidByA = expenses.filter(exp => exp.payer === userA).reduce((sum, exp) => sum + exp.amount, 0);
        
        const totalExpenseString = locales[currentLang]?.totalExpense || 'Total Expense';
        totalExpenseP.textContent = `${totalExpenseString}: ${totalAmount.toLocaleString()} JPY`;
        
        const balanceA = amountPaidByA - totalOwedByA;
        let settlementText = locales[currentLang]?.settlementDone || 'Settled';
        const paysToString = locales[currentLang]?.paysTo || '→';
        if (balanceA > 0.01) settlementText = `${userB} ${paysToString} ${userA}: ${Math.round(balanceA).toLocaleString()} JPY`;
        else if (balanceA < -0.01) settlementText = `${userA} ${paysToString} ${userB}: ${Math.round(Math.abs(balanceA)).toLocaleString()} JPY`;
        finalSettlementP.textContent = settlementText;
    }

    function clearInputs() {
        itemNameInput.value = ''; itemAmountInput.value = '';
        splitAmountAInput.value = ''; splitAmountBInput.value = '';
        splitMethodSelect.value = 'equal';
        splitAmountInputs.classList.add('hidden');
        itemNameInput.focus();
    }

    function downloadExcel() {
        if (!currentSettlement) return;
        const { expenses, participants, date, title } = currentSettlement;
        const [userA, userB] = participants;
        const data = expenses.map(exp => ({
            '항목': exp.name,
            '총액 (JPY)': exp.amount,
            '결제자': exp.payer,
            '분배 방식': exp.split,
            [`${userA} 부담액 (JPY)`]: Math.round(exp.shares[userA]),
            [`${userB} 부담액 (JPY)`]: Math.round(exp.shares[userB])
        }));
        const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        data.push({});
        data.push({ '항목': '총 지출', '총액 (JPY)': totalAmount });
        data.push({ '항목': '최종 정산', '총액 (JPY)': finalSettlementP.textContent });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '정산 내역');
        const fileName = `${date}_${title.replace(/\s+/g, '_')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    // --- Start the App ---
    initialize();
});