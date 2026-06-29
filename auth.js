document.addEventListener('DOMContentLoaded', async () => {
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    let currentLang = 'ko';
    let authRequestPending = false;
    const APP_VERSION = 'v2026.06.29.2';
    const THEME_STORAGE_KEY = 'settleup-theme-mode';
    const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function applyThemeMode() {
        const mode = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
        const isDark = mode === 'dark' || (mode === 'system' && systemDarkQuery.matches);
        document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) themeColorMeta.content = isDark ? '#0b1120' : '#6366f1';
    }

    applyThemeMode();
    const handleSystemThemeChange = () => {
        if ((localStorage.getItem(THEME_STORAGE_KEY) || 'system') === 'system') applyThemeMode();
    };
    if (systemDarkQuery.addEventListener) systemDarkQuery.addEventListener('change', handleSystemThemeChange);
    else if (systemDarkQuery.addListener) systemDarkQuery.addListener(handleSystemThemeChange);

    function normalizeInviteCode(code) {
        const normalized = (code || '').trim().toUpperCase();
        return normalized || null;
    }

    const loginUrlParams = new URLSearchParams(window.location.search);
    const initialInviteCode = normalizeInviteCode(loginUrlParams.get('code') || localStorage.getItem('pendingJoinCode'));
    if (initialInviteCode) localStorage.setItem('pendingJoinCode', initialInviteCode);

    function getPostLoginTarget() {
        const inviteCode = normalizeInviteCode(localStorage.getItem('pendingJoinCode') || initialInviteCode);
        return inviteCode ? `index.html?code=${encodeURIComponent(inviteCode)}` : 'index.html';
    }

    function getLoginTarget() {
        const inviteCode = normalizeInviteCode(localStorage.getItem('pendingJoinCode') || initialInviteCode);
        return inviteCode ? `login.html?code=${encodeURIComponent(inviteCode)}` : 'login.html';
    }

    const languageSwitcher = document.getElementById('language-switcher');
    const appVersionBadge = document.getElementById('app-version-badge');
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    const forgotPasswordView = document.getElementById('forgot-password-view');
    const updatePasswordView = document.getElementById('update-password-view');
    const landingView = document.getElementById('landing-view');
    const authWrapper = document.getElementById('auth-wrapper');
    const authCard = document.querySelector('.auth-card');
    const views = {
        login: loginView,
        signup: signupView,
        'forgot-password': forgotPasswordView,
        'update-password': updatePasswordView
    };
    const feedbackElements = {
        login: document.getElementById('login-feedback'),
        signup: document.getElementById('signup-feedback'),
        reset: document.getElementById('reset-feedback'),
        'update-password': document.getElementById('update-password-feedback')
    };

    if (authCard) authCard.style.opacity = '0';
    if (appVersionBadge) appVersionBadge.textContent = APP_VERSION;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        window.location.replace(getPostLoginTarget());
        return;
    }
    if (landingView) landingView.style.display = 'block';

    function translate(key, fallback = '') {
        return locales[currentLang]?.[key] || fallback;
    }

    function setAuthFeedback(viewName, message, type = 'error') {
        const feedback = feedbackElements[viewName];
        if (!feedback) return;
        feedback.textContent = message;
        feedback.classList.remove('hidden', 'error', 'success', 'info');
        feedback.classList.add(type);
    }

    function clearAuthFeedback(viewName) {
        const feedback = feedbackElements[viewName];
        if (!feedback) return;
        feedback.textContent = '';
        feedback.classList.add('hidden');
        feedback.classList.remove('error', 'success', 'info');
    }

    function clearAllAuthFeedback() {
        Object.keys(feedbackElements).forEach(clearAuthFeedback);
    }

    function setButtonBusy(button, isBusy) {
        if (!button) return;
        if (isBusy) {
            if (button.dataset.busy === 'true') return;
            button.dataset.busy = 'true';
            button.dataset.idleHtml = button.innerHTML;
            const labelText = button.textContent.trim();
            const spinner = document.createElement('i');
            spinner.className = 'fas fa-spinner fa-spin';
            spinner.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = labelText;
            button.replaceChildren(spinner, label);
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            return;
        }

        if (button.dataset.idleHtml !== undefined) button.innerHTML = button.dataset.idleHtml;
        delete button.dataset.busy;
        delete button.dataset.idleHtml;
        button.disabled = false;
        button.removeAttribute('aria-busy');
    }

    async function runAuthRequest(button, request) {
        if (authRequestPending) return null;
        authRequestPending = true;
        setButtonBusy(button, true);
        try {
            return await request();
        } finally {
            setButtonBusy(button, false);
            authRequestPending = false;
        }
    }

    function updatePasswordToggleLabels() {
        document.querySelectorAll('.auth-password-toggle').forEach(button => {
            const input = document.getElementById(button.dataset.passwordTarget);
            if (!input) return;
            const isVisible = input.type === 'text';
            const label = isVisible
                ? translate('hidePassword', '비밀번호 숨기기')
                : translate('showPassword', '비밀번호 표시');
            button.setAttribute('aria-label', label);
            button.title = label;
        });
    }

    function updateUI(lang) {
        currentLang = lang;
        const translations = locales[lang];
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (translations[key] && element.getAttribute('aria-busy') !== 'true') {
                element.textContent = translations[key];
            }
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (translations[key]) element.placeholder = translations[key];
        });
        updatePasswordToggleLabels();
    }

    function setLanguage(lang) {
        localStorage.setItem('preferredLang', lang);
        if (languageSwitcher) languageSwitcher.value = lang;
        updateUI(lang);
    }

    const preferredLang = localStorage.getItem('preferredLang');
    const browserLang = navigator.language.split('-')[0];
    setLanguage(preferredLang || (['ko', 'en', 'ja'].includes(browserLang) ? browserLang : 'en'));
    if (languageSwitcher) languageSwitcher.addEventListener('change', event => setLanguage(event.target.value));

    function showView(viewName) {
        Object.values(views).forEach(view => view?.classList.add('hidden'));
        views[viewName]?.classList.remove('hidden');
        clearAllAuthFeedback();
        const firstInput = views[viewName]?.querySelector('input');
        if (firstInput) window.setTimeout(() => firstInput.focus(), 0);
    }

    function showAuthForm() {
        if (landingView) landingView.style.display = 'none';
        if (authWrapper) authWrapper.style.display = 'flex';
        if (authCard) {
            authCard.style.transition = 'opacity 0.3s ease';
            authCard.style.opacity = '1';
        }
        const navLoginBtn = document.getElementById('nav-login-btn');
        if (navLoginBtn) navLoginBtn.style.display = 'none';
    }

    function redirectToExternalBrowser(targetPage) {
        const userAgent = navigator.userAgent.toLowerCase();
        let currentPath = window.location.pathname;
        if (currentPath.endsWith('/')) currentPath += 'login.html';
        const targetUrl = window.location.origin + currentPath.replace(/[^/]*$/, targetPage);

        if (!userAgent.match(/kakaotalk|line|inapp|naver|instagram|facebook/i)) return false;

        if (userAgent.match(/android/i)) {
            location.href = `intent://${targetUrl.replace(/^https?:\/\//i, '')}#Intent;scheme=https;package=com.android.chrome;end`;
            return true;
        }

        if (userAgent.match(/iphone|ipad|ipod/i) && userAgent.match(/kakaotalk/i)) {
            location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(targetUrl)}`;
            window.setTimeout(() => {
                showAuthForm();
                setAuthFeedback(
                    'login',
                    translate('externalBrowserHelp', '브라우저 메뉴에서 Safari나 Chrome으로 열어 주세요.'),
                    'info'
                );
            }, 1000);
            return true;
        }
        return false;
    }

    function handleAuthBtnClick(event) {
        event?.preventDefault();
        if (redirectToExternalBrowser(getLoginTarget())) return;
        showAuthForm();
        showView('login');
    }

    document.getElementById('nav-login-btn')?.addEventListener('click', handleAuthBtnClick);
    document.getElementById('hero-start-btn')?.addEventListener('click', handleAuthBtnClick);

    supabaseClient.auth.onAuthStateChange(event => {
        if (event === 'PASSWORD_RECOVERY') {
            showAuthForm();
            showView('update-password');
        }
    });

    document.getElementById('go-to-signup')?.addEventListener('click', event => {
        event.preventDefault();
        showView('signup');
    });
    document.getElementById('go-to-login-from-signup')?.addEventListener('click', event => {
        event.preventDefault();
        showView('login');
    });
    document.getElementById('go-to-forgot-password')?.addEventListener('click', event => {
        event.preventDefault();
        showView('forgot-password');
    });
    document.getElementById('go-to-login-from-reset')?.addEventListener('click', event => {
        event.preventDefault();
        showView('login');
    });

    document.querySelectorAll('.auth-password-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.dataset.passwordTarget);
            if (!input) return;
            const showPassword = input.type === 'password';
            input.type = showPassword ? 'text' : 'password';
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye', !showPassword);
                icon.classList.toggle('fa-eye-slash', showPassword);
            }
            updatePasswordToggleLabels();
            input.focus({ preventScroll: true });
        });
    });

    document.querySelectorAll('.auth-form').forEach(form => {
        form.addEventListener('input', () => {
            const activeView = Object.entries(views).find(([, view]) => view && !view.classList.contains('hidden'))?.[0];
            if (activeView === 'forgot-password') clearAuthFeedback('reset');
            else if (activeView) clearAuthFeedback(activeView);
        });
    });

    function validateEmail(input, feedbackView) {
        const value = input.value.trim();
        if (!value) {
            setAuthFeedback(feedbackView, translate('authEmailRequired', '이메일을 입력해 주세요.'));
            input.focus();
            return null;
        }
        if (input.validity.typeMismatch) {
            setAuthFeedback(feedbackView, translate('authInvalidEmail', '올바른 이메일 주소를 입력해 주세요.'));
            input.focus();
            return null;
        }
        return value;
    }

    function authErrorMessage(error, fallbackKey, fallback) {
        if (error?.message === 'Invalid login credentials') {
            return translate('invalidCredentials', '없는 계정이거나 비밀번호가 맞지 않습니다.');
        }
        return error?.message || translate(fallbackKey, fallback);
    }

    async function handleOAuthLogin(provider, button) {
        if (redirectToExternalBrowser(getLoginTarget())) return;
        clearAuthFeedback('login');

        try {
            const result = await runAuthRequest(button, () => supabaseClient.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: window.location.origin + window.location.pathname.replace('login.html', getPostLoginTarget())
                }
            }));
            if (result?.error) {
                setAuthFeedback(
                    'login',
                    authErrorMessage(result.error, 'authLoginError', '로그인 중 문제가 발생했습니다.')
                );
            }
        } catch (error) {
            setAuthFeedback('login', authErrorMessage(error, 'authLoginError', '로그인 중 문제가 발생했습니다.'));
        }
    }

    const btnGoogle = document.getElementById('btn-google');
    btnGoogle?.addEventListener('click', () => handleOAuthLogin('google', btnGoogle));
    const btnApple = document.getElementById('btn-apple');
    btnApple?.addEventListener('click', () => handleOAuthLogin('apple', btnApple));

    document.getElementById('login-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (authRequestPending) return;
        clearAuthFeedback('login');

        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            setAuthFeedback('login', translate('authLoginFieldsRequired', '이메일과 비밀번호를 입력해 주세요.'));
            (!email ? emailInput : passwordInput).focus();
            return;
        }
        if (emailInput.validity.typeMismatch) {
            setAuthFeedback('login', translate('authInvalidEmail', '올바른 이메일 주소를 입력해 주세요.'));
            emailInput.focus();
            return;
        }

        const button = document.getElementById('submit-login-btn');
        try {
            const result = await runAuthRequest(button, () => supabaseClient.auth.signInWithPassword({ email, password }));
            if (result?.error) {
                setAuthFeedback(
                    'login',
                    authErrorMessage(result.error, 'authLoginError', '로그인 중 문제가 발생했습니다.')
                );
                passwordInput.focus();
                return;
            }
            if (result) window.location.replace(getPostLoginTarget());
        } catch (error) {
            setAuthFeedback('login', authErrorMessage(error, 'authLoginError', '로그인 중 문제가 발생했습니다.'));
        }
    });

    document.getElementById('signup-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (authRequestPending) return;
        clearAuthFeedback('signup');

        const emailInput = document.getElementById('signup-email');
        const passwordInput = document.getElementById('signup-password');
        const confirmPasswordInput = document.getElementById('signup-password-confirm');
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!email || !password || !confirmPassword) {
            setAuthFeedback('signup', translate('authAllFieldsRequired', '모든 항목을 입력해 주세요.'));
            (!email ? emailInput : (!password ? passwordInput : confirmPasswordInput)).focus();
            return;
        }
        if (emailInput.validity.typeMismatch) {
            setAuthFeedback('signup', translate('authInvalidEmail', '올바른 이메일 주소를 입력해 주세요.'));
            emailInput.focus();
            return;
        }
        if (password.length < 6) {
            setAuthFeedback('signup', translate('authPasswordMinLength', '비밀번호는 6자리 이상 입력해 주세요.'));
            passwordInput.focus();
            return;
        }
        if (password !== confirmPassword) {
            setAuthFeedback('signup', translate('passwordsDoNotMatch', '비밀번호가 일치하지 않습니다.'));
            confirmPasswordInput.focus();
            return;
        }

        const button = document.getElementById('submit-signup-btn');
        try {
            const result = await runAuthRequest(button, () => supabaseClient.auth.signUp({ email, password }));
            if (result?.error) {
                setAuthFeedback(
                    'signup',
                    authErrorMessage(result.error, 'authSignupError', '회원가입 중 문제가 발생했습니다.')
                );
                return;
            }
            if (result?.data?.session) {
                window.location.replace(getPostLoginTarget());
                return;
            }
            showView('login');
            setAuthFeedback('login', translate('signupSuccess', '가입 성공!'), 'success');
        } catch (error) {
            setAuthFeedback('signup', authErrorMessage(error, 'authSignupError', '회원가입 중 문제가 발생했습니다.'));
        }
    });

    document.getElementById('reset-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (authRequestPending) return;
        clearAuthFeedback('reset');

        const emailInput = document.getElementById('reset-email');
        const email = validateEmail(emailInput, 'reset');
        if (!email) return;

        const button = document.getElementById('submit-reset-btn');
        try {
            const result = await runAuthRequest(button, () => supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname
            }));
            if (result?.error) {
                setAuthFeedback(
                    'reset',
                    authErrorMessage(result.error, 'authResetError', '재설정 링크를 보내지 못했습니다.')
                );
                return;
            }
            showView('login');
            setAuthFeedback('login', translate('checkEmailForLink', '이메일로 전송된 링크를 확인해 주세요!'), 'success');
        } catch (error) {
            setAuthFeedback('reset', authErrorMessage(error, 'authResetError', '재설정 링크를 보내지 못했습니다.'));
        }
    });

    document.getElementById('update-password-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (authRequestPending) return;
        clearAuthFeedback('update-password');

        const passwordInput = document.getElementById('new-password');
        const newPassword = passwordInput.value;
        if (!newPassword || newPassword.length < 6) {
            setAuthFeedback(
                'update-password',
                translate('authPasswordMinLength', '비밀번호는 6자리 이상 입력해 주세요.')
            );
            passwordInput.focus();
            return;
        }

        const button = document.getElementById('submit-update-password-btn');
        try {
            const result = await runAuthRequest(button, () => supabaseClient.auth.updateUser({ password: newPassword }));
            if (result?.error) {
                setAuthFeedback(
                    'update-password',
                    authErrorMessage(result.error, 'authPasswordUpdateError', '비밀번호를 변경하지 못했습니다.')
                );
                return;
            }
            window.location.replace('index.html');
        } catch (error) {
            setAuthFeedback(
                'update-password',
                authErrorMessage(error, 'authPasswordUpdateError', '비밀번호를 변경하지 못했습니다.')
            );
        }
    });
});
