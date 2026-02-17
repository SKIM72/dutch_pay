document.addEventListener('DOMContentLoaded', () => {

    const leftPane = document.getElementById('left-pane');
    const rightPane = document.getElementById('right-pane');
    const placeholderRightPane = document.getElementById('placeholder-right-pane');
    const calculatorView = document.getElementById('calculator');
    const mainDatePicker = document.getElementById('main-date-picker');
    const settlementListContainer = document.getElementById('settlement-list-container');
    const addSettlementFab = document.getElementById('add-settlement-fab');
    const addSettlementModal = document.getElementById('add-settlement-modal');
    const modalDateDisplay = document.getElementById('modal-date-display');
    const newSettlementTitleInput = document.getElementById('new-settlement-title');
    const createSettlementBtn = document.getElementById('create-settlement-btn');
    const closeModalBtn = document.querySelector('.close-modal-btn');
    const settlementDisplay = document.getElementById('settlement-display');
    const settlementDateBadge = document.getElementById('settlement-date-badge');

    let settlements = {}; 
    let currentSettlement = null;
    let userA = 'A', userB = 'B';

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
    });

    closeModalBtn.addEventListener('click', closeModal);
    addSettlementModal.addEventListener('click', (e) => { if (e.target.id === 'add-settlement-modal') closeModal(); });

    function closeModal() { addSettlementModal.classList.add('hidden'); }

    createSettlementBtn.addEventListener('click', () => {
        const title = newSettlementTitleInput.value.trim();
        const date = mainDatePicker.value;
        if (title && date) {
            if (!settlements[date]) settlements[date] = [];
            const newSettlement = { id: Date.now(), title, date, expenses: [] };
            settlements[date].push(newSettlement);
            renderSettlementList(date);
            selectSettlement(newSettlement);
            closeModal();
            newSettlementTitleInput.value = '';
        }
    });

    function selectSettlement(settlement) {
        currentSettlement = settlement;
        placeholderRightPane.classList.add('hidden');
        calculatorView.classList.remove('hidden');
        
        // Update Title and Date Badge
        settlementDisplay.textContent = settlement.title;
        settlementDateBadge.textContent = settlement.date;
        
        document.querySelectorAll('.settlement-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id == settlement.id);
        });
        render();
    }

    function renderSettlementList(date) {
        settlementListContainer.innerHTML = '';
        const dailySettlements = settlements[date] || [];
        if (dailySettlements.length === 0) {
            settlementListContainer.innerHTML = '<p class="subtitle">기록이 없습니다.</p>';
        } else {
            dailySettlements.forEach(settlement => {
                const item = document.createElement('div');
                item.className = 'settlement-item';
                item.dataset.id = settlement.id;
                item.innerHTML = `<span>${settlement.title}</span><i class="fas fa-chevron-right"></i>`;
                item.addEventListener('click', () => selectSettlement(settlement));
                settlementListContainer.appendChild(item);
            });
        }
    }

    const addExpenseBtn = document.getElementById('add-expense-btn');
    const itemNameInput = document.getElementById('item-name');
    const itemAmountInput = document.getElementById('item-amount');
    const itemPayerSelect = document.getElementById('item-payer');
    const splitMethodSelect = document.getElementById('split-method');
    const splitAmountInputs = document.getElementById('split-amount-inputs');
    const splitAmountAInput = document.getElementById('split-amount-a');
    const splitAmountBInput = document.getElementById('split-amount-b');
    const expenseList = document.querySelector('#expense-list ul');
    const totalExpenseP = document.getElementById('total-expense');
    const finalSettlementP = document.getElementById('final-settlement');

    addExpenseBtn.addEventListener('click', () => {
        if (!currentSettlement) return;
        const name = itemNameInput.value.trim();
        const totalAmount = parseFloat(itemAmountInput.value);
        const payer = itemPayerSelect.value;
        const splitMethod = splitMethodSelect.value;

        if (!name || isNaN(totalAmount) || totalAmount <= 0) { alert('정보를 입력하세요.'); return; }

        let shares = {}, isValid = true;
        switch (splitMethod) {
            case 'equal': shares.A = totalAmount / 2; shares.B = totalAmount / 2; break;
            case 'percent':
                const percentA = parseFloat(prompt('A 비율(%):', '50'));
                if (isNaN(percentA) || percentA < 0 || percentA > 100) { isValid = false; break; }
                shares.A = totalAmount * (percentA / 100); shares.B = totalAmount - shares.A; break;
            case 'amount':
                const amountA = parseFloat(splitAmountAInput.value);
                const amountB = parseFloat(splitAmountBInput.value);
                if (isNaN(amountA) || isNaN(amountB) || Math.abs(amountA + amountB - totalAmount) > 0.01) { isValid = false; break; }
                shares.A = amountA; shares.B = amountB; break;
        }

        if (isValid) {
            currentSettlement.expenses.push({ name, amount: totalAmount, payer, split: splitMethod, shares });
            render();
            clearInputs();
        }
    });

    splitMethodSelect.addEventListener('change', () => {
        splitAmountInputs.classList.toggle('hidden', splitMethodSelect.value !== 'amount');
    });

    function render() {
        if (!currentSettlement) return;
        renderExpenses();
        updateSummary();
    }

    function renderExpenses() {
        expenseList.innerHTML = '';
        currentSettlement.expenses.forEach(exp => {
            const li = document.createElement('li');
            li.className = 'expense-item';
            li.innerHTML = `
                <div class="item-main">
                    <span class="item-name">${exp.name}</span>
                    <span class="item-meta">${exp.payer} 결제 · ${exp.split}</span>
                </div>
                <div class="item-amount">
                    <div>${exp.amount.toLocaleString()} JPY</div>
                    <div class="item-share">A: ${Math.round(exp.shares.A).toLocaleString()} / B: ${Math.round(exp.shares.B).toLocaleString()}</div>
                </div>
            `;
            expenseList.appendChild(li);
        });
    }
    
    function updateSummary() {
        const expenses = currentSettlement.expenses;
        const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const totalOwedByA = expenses.reduce((sum, exp) => sum + exp.shares.A, 0);
        const amountPaidByA = expenses.filter(exp => exp.payer === userA).reduce((sum, exp) => sum + exp.amount, 0);

        totalExpenseP.textContent = `총 지출: ${totalAmount.toLocaleString()} JPY`;
        const balanceA = amountPaidByA - totalOwedByA;
        let settlementText = '';
        if (balanceA > 0.01) settlementText = `${userB} → ${userA}: ${Math.round(balanceA).toLocaleString()} JPY`;
        else if (balanceA < -0.01) settlementText = `${userA} → ${userB}: ${Math.round(Math.abs(balanceA)).toLocaleString()} JPY`;
        else settlementText = '완료';
        finalSettlementP.textContent = settlementText;
    }

    function clearInputs() {
        itemNameInput.value = ''; itemAmountInput.value = '';
        splitAmountAInput.value = ''; splitAmountBInput.value = '';
        splitMethodSelect.value = 'equal';
        splitAmountInputs.classList.add('hidden');
        itemNameInput.focus();
    }
});