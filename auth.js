document.addEventListener('DOMContentLoaded', async () => {
    
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    let currentLang = 'ko';

    // 🚀 [추가됨] 인앱 브라우저 강제 탈출 로직 (CleanURL 적용)
    function redirectToExternalBrowser(targetPage) {
        const userAgent = navigator.userAgent.toLowerCase();
        let currentPath = window.location.pathname;
        if(currentPath.endsWith('/')) currentPath += 'login.html'; 
        const targetUrl = window.location.origin + currentPath.replace(/[^\/]*$/, targetPage);

        if (userAgent.match(/kakaotalk|line|inapp|naver|instagram|facebook/i)) {
            if (userAgent.match(/android/i)) {
                // 안드로이드: 크롬 브라우저 강제 호출
                location.href = `intent://${targetUrl.replace(/^https?:\/\//i, '')}#Intent;scheme=https;package=com.android.chrome;end`;
                return true;
            } else if (userAgent.match(/iphone|ipad|ipod/i)) {
                if (userAgent.match(/kakaotalk/i)) {
                    // iOS: 카카오톡 외부 브라우저 호출 스킴
                    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(targetUrl)}`;
                    setTimeout(() => {
                        alert("구글/애플 로그인을 위해 우측 하단 [ ⋮ ] 버튼을 눌러 'Safari로 열기'를 선택해 주세요.");
                    }, 1000);
                    return true;
                }
            }
        }
        return false;
    }

    // --- Elements ---
    const languageSwitcher = document.getElementById('language-switcher');
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    const forgotPasswordView = document.getElementById('forgot-password-view');
    const updatePasswordView = document.getElementById('update-password-view');
    
    const landingView = document.getElementById('landing-view');
    const authWrapper = document.getElementById('auth-wrapper');
    const authCard = document.querySelector('.auth-card'); 

    // 초기 깜빡임 방지용 숨김 처리
    if(authCard) authCard.style.opacity = '0'; 

    // --- Session Check ---
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        window.location.replace('index.html'); // 이미 로그인된 유저는 바로 메인 화면으로 패스
        return;
    } else {
        if(landingView) landingView.style.display = 'block';
    }

    // 🚀 소개 페이지에서 버튼 누를 때 로그인 창 보여주는 함수
    const showAuthForm = () => {
        if(landingView) landingView.style.display = 'none';
        if(authWrapper) authWrapper.style.display = 'flex'; 
        if(authCard) {
            authCard.style.transition = 'opacity 0.3s ease';
            authCard.style.opacity = '1';
        }
        
        // 🚀 수정됨: 로그인 화면으로 전환 시, 불필요해진 상단 '로그인' 버튼 숨기기 (언어 선택기만 남음)
        const navLoginBtn = document.getElementById('nav-login-btn');
        if (navLoginBtn) navLoginBtn.style.display = 'none';
    };

    // 🚀 [추가됨] 클릭 시 인앱 탈출을 먼저 확인하는 핸들러
    const handleAuthBtnClick = (e) => {
        if (e) e.preventDefault();
        // 인앱 브라우저면 외부로 튕겨내고 함수 종료
        if (redirectToExternalBrowser('login.html')) return; 
        showAuthForm();
    };

    // 이벤트 리스너 연결 (수정됨: showAuthForm 대신 handleAuthBtnClick 연결)
    const navLoginBtn = document.getElementById('nav-login-btn');
    if(navLoginBtn) navLoginBtn.addEventListener('click', handleAuthBtnClick);
    
    const heroStartBtn = document.getElementById('hero-start-btn');
    if(heroStartBtn) heroStartBtn.addEventListener('click', handleAuthBtnClick);


    // 비밀번호 재설정 링크를 타고 왔는지 확인
    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
            showAuthForm(); 
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

    // 엔터 키 처리
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


    // 소셜 로그인 처리 로직
    const handleOAuthLogin = async (provider) => {
        // 🚀 [추가됨] 구글/애플 버튼 직접 클릭 시에도 인앱 탈출 방어막 작동
        if (redirectToExternalBrowser('login.html')) return;

        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: window.location.origin + window.location.pathname.replace('login.html', 'index.html')
            }
        });
        if (error) alert(error.message);
    };

    const btnGoogle = document.getElementById('btn-google');
    if (btnGoogle) btnGoogle.addEventListener('click', () => handleOAuthLogin('google'));

    const btnApple = document.getElementById('btn-apple');
    if (btnApple) btnApple.addEventListener('click', () => handleOAuthLogin('apple'));


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
            let displayMessage = error.message;
            if (displayMessage === 'Invalid login credentials') {
                displayMessage = locales[currentLang]?.invalidCredentials || '없는 계정이거나 비밀번호가 맞지 않습니다.';
            }
            
            alert(displayMessage);
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

        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        
        btn.innerHTML = originalText;
        btn.disabled = false;

        if (error) alert(error.message);
        else {
            if (data && data.session) {
                window.location.replace('index.html');
            } else {
                alert(locales[currentLang]?.signupSuccess || '가입 성공!');
                showView('login');
            }
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