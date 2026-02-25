document.addEventListener('DOMContentLoaded', async () => {
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    let currentLang = 'ko';

    // --- Elements ---
    const languageSwitcher = document.getElementById('language-switcher');
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    const forgotPasswordView = document.getElementById('forgot-password-view');
    const updatePasswordView = document.getElementById('update-password-view');
    const authCard = document.querySelector('.auth-card'); 

    // 🚀 매끄러운 자동 로그인을 위해 폼을 숨겨두고 시작
    authCard.style.opacity = '0'; 

    // --- Session Check (이미 로그인되어 있으면 바로 메인으로 이동) ---
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        window.location.replace('index.html'); // 깜빡임 없이 즉시 메인 페이지로 이동
        return;
    } else {
        // 비로그인 상태일 때만 서서히 로그인 폼을 표시
        authCard.style.transition = 'opacity 0.3s ease';
        authCard.style.opacity = '1';
    }

    // 비밀번호 재설정 링크를 타고 왔는지 확인
    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
            showView('update-password');
        }
    });

    // --- Language Settings ---
    function updateUI(lang) {
        currentLang = lang;
        const translations = locales[lang];
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[key]) el.innerHTML = translations[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
             if (translations[key]) el.placeholder = translations[key];
        });
    }

    function setLanguage(lang) {
        localStorage.setItem('preferredLang', lang);
        languageSwitcher.value = lang;
        updateUI(lang);
    }

    const preferredLang = localStorage.getItem('preferredLang');
    const browserLang = navigator.language.split('-')[0];
    setLanguage(preferredLang || (['ko', 'en', 'ja'].includes(browserLang) ? browserLang : 'en'));
    languageSwitcher.addEventListener('change', (e) => setLanguage(e.target.value));

    // --- View Navigation ---
    function showView(viewName) {
        loginView.classList.add('hidden');
        signupView.classList.add('hidden');
        forgotPasswordView.classList.add('hidden');
        updatePasswordView.classList.add('hidden');
        document.getElementById(`${viewName}-view`).classList.remove('hidden');
    }

    document.getElementById('go-to-signup').addEventListener('click', (e) => { e.preventDefault(); showView('signup'); });
    document.getElementById('go-to-login-from-signup').addEventListener('click', (e) => { e.preventDefault(); showView('login'); });
    document.getElementById('go-to-forgot-password').addEventListener('click', (e) => { e.preventDefault(); showView('forgot-password'); });
    document.getElementById('go-to-login-from-reset').addEventListener('click', (e) => { e.preventDefault(); showView('login'); });

    // 🚀 엔터 키(Enter)로 로그인/회원가입 버튼 자동 클릭
    const handleEnterKey = (buttonId) => (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            document.getElementById(buttonId).click();
        }
    };

    document.getElementById('login-email').addEventListener('keypress', handleEnterKey('submit-login-btn'));
    document.getElementById('login-password').addEventListener('keypress', handleEnterKey('submit-login-btn'));
    
    document.getElementById('signup-email').addEventListener('keypress', handleEnterKey('submit-signup-btn'));
    document.getElementById('signup-password').addEventListener('keypress', handleEnterKey('submit-signup-btn'));
    document.getElementById('signup-password-confirm').addEventListener('keypress', handleEnterKey('submit-signup-btn'));

    document.getElementById('reset-email').addEventListener('keypress', handleEnterKey('submit-reset-btn'));
    document.getElementById('new-password').addEventListener('keypress', handleEnterKey('submit-update-password-btn'));


    // --- Auth Logic ---
    document.getElementById('submit-login-btn').addEventListener('click', async () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const btn = document.getElementById('submit-login-btn');

        if (!email || !password) return alert('이메일과 비밀번호를 입력해주세요.');

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (error) {
            alert(error.message);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        else {
            window.location.replace('index.html'); 
        }
    });

    document.getElementById('submit-signup-btn').addEventListener('click', async () => {
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-password-confirm').value;
        
        if (!email || !password) return alert('모든 칸을 입력해주세요.');
        if (password !== confirmPassword) return alert(locales[currentLang]?.passwordsDoNotMatch || '비밀번호가 일치하지 않습니다.');

        const btn = document.getElementById('submit-signup-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const { error } = await supabaseClient.auth.signUp({ email, password });
        
        btn.innerHTML = originalText;
        btn.disabled = false;

        if (error) alert(error.message);
        else {
            alert(locales[currentLang]?.signupSuccess || '가입 성공! 이메일을 확인해주세요.');
            showView('login');
        }
    });

    document.getElementById('submit-reset-btn').addEventListener('click', async () => {
        const email = document.getElementById('reset-email').value;
        if (!email) return alert('이메일을 입력해주세요.');

        const btn = document.getElementById('submit-reset-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname, 
        });
        
        btn.innerHTML = originalText;
        btn.disabled = false;

        if (error) alert(error.message);
        else {
            alert(locales[currentLang]?.checkEmailForLink || '이메일로 링크를 발송했습니다.');
            showView('login');
        }
    });

    document.getElementById('submit-update-password-btn').addEventListener('click', async () => {
        const newPassword = document.getElementById('new-password').value;
        if (!newPassword) return alert('새 비밀번호를 입력해주세요.');

        const btn = document.getElementById('submit-update-password-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        
        if (error) {
            alert(error.message);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        else {
            alert(locales[currentLang]?.passwordUpdated || '비밀번호가 성공적으로 변경되었습니다.');
            window.location.replace('index.html'); 
        }
    });
});