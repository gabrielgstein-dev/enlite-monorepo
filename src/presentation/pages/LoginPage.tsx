import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { GoogleLoginButton } from '@presentation/components/auth/GoogleLoginButton';
import { useAuth } from '@presentation/contexts/useAuth';
import '../../styles/login.css';

const loginSchema = z.object({
  email: z.string().min(1, 'login.emailRequired').email('register.invalidEmail'),
  password: z.string().min(1, 'login.passwordRequired'),
});

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSuccess = () => {
    // Support ?next= redirect for auth-guarded pages
    const next = searchParams.get('next');
    navigate(next || '/');
  };

  const handleError = (err: Error) => {
    console.error('Login failed:', err);
    setError(err.message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(t(result.error.errors[0].message));
      return;
    }

    setIsLoading(true);
    
    try {
      await login(email, password);
      handleSuccess();
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Login failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      {/* Navbar */}
      <nav className="login-navbar">
        <img
          src="https://api.builder.io/api/v1/image/assets/TEMP/c445edca8ca03c56e63b003771e642c659b162b4?width=321"
          alt="Enlite Health Solutions"
          className="login-logo"
        />
        <div className="login-navbar-actions">
          <div className="login-country">
            <svg width="28" height="20" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M28 16.9231C28 17.7391 27.6722 18.5218 27.0888 19.0988C26.5053 19.6758 25.714 20 24.8889 20H3.11111C2.28599 20 1.49467 19.6758 0.911223 19.0988C0.327777 18.5218 0 17.7391 0 16.9231V3.07692C0 2.26087 0.327777 1.47824 0.911223 0.90121C1.49467 0.324175 2.28599 0 3.11111 0H24.8889C25.714 0 26.5053 0.324175 27.0888 0.90121C27.6722 1.47824 28 2.26087 28 3.07692V16.9231Z" fill="#75AADB"/>
              <path d="M0 6.15625H28V13.8486H0V6.15625Z" fill="#EEEEEE"/>
              <path d="M14 6.15625L14.3795 8.11625L15.4886 6.44933L15.0803 8.40317L16.7494 7.2824L15.6162 8.93394L17.5925 8.53087L15.9071 9.62702L17.8889 10.0024L15.9071 10.3778L17.5925 11.4747L15.6162 11.0709L16.7494 12.7216L15.0803 11.6009L15.4886 13.5555L14.3795 11.8886L14 13.8486L13.6205 11.8886L12.5122 13.5555L12.9197 11.6009L11.2498 12.7216L12.3831 11.0709L10.4075 11.4747L12.093 10.3778L10.1112 10.0024L12.093 9.62702L10.4075 8.53087L12.3831 8.93394L11.2498 7.2824L12.9197 8.40317L12.5122 6.44933L13.6205 8.11625L14 6.15625Z" fill="#FCBF49"/>
            </svg>
            <span className="login-country-name">{t('common.country')}</span>
          </div>

        </div>
      </nav>

      {/* Main content */}
      <div className="login-content">
        {/* Left: Form */}
        <div className="login-form-section">
          <div className="login-header">
            <h1 className="login-title">{t('login.title')}</h1>
            <p className="login-description">
              {t('login.description')}
            </p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div className="login-inputs">
              {/* Email */}
              <div className="login-field">
                <label className="login-field-label" htmlFor="email">{t('common.email')}</label>
                <div className="login-field-input-wrapper">
                  <input
                    id="email"
                    type="email"
                    className="login-field-input"
                    placeholder={t('common.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <span className="login-field-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17 21.25H7C3.35 21.25 1.25 19.15 1.25 15.5V8.5C1.25 4.85 3.35 2.75 7 2.75H17C20.65 2.75 22.75 4.85 22.75 8.5V15.5C22.75 19.15 20.65 21.25 17 21.25ZM7 4.25C4.14 4.25 2.75 5.64 2.75 8.5V15.5C2.75 18.36 4.14 19.75 7 19.75H17C19.86 19.75 21.25 18.36 21.25 15.5V8.5C21.25 5.64 19.86 4.25 17 4.25H7Z" fill="#180149"/>
                      <path d="M12.003 12.868C11.163 12.868 10.313 12.608 9.663 12.078L6.533 9.57802C6.213 9.31802 6.153 8.84802 6.413 8.52802C6.673 8.20802 7.143 8.14802 7.463 8.40802L10.593 10.908C11.353 11.518 12.643 11.518 13.403 10.908L16.533 8.40802C16.853 8.14802 17.333 8.19802 17.583 8.52802C17.843 8.84802 17.793 9.32802 17.463 9.57802L14.333 12.078C13.693 12.608 12.843 12.868 12.003 12.868Z" fill="#180149"/>
                    </svg>
                  </span>
                </div>
              </div>

              {/* Password */}
              <div className="login-field">
                <label className="login-field-label" htmlFor="password">{t('common.password')}</label>
                <div className="login-field-input-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="login-field-input"
                    placeholder={t('common.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="login-field-icon login-field-icon-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
                  >
                    {showPassword ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 16.33C9.67 16.33 7.77 14.43 7.77 12.1C7.77 9.77 9.67 7.87 12 7.87C14.33 7.87 16.23 9.77 16.23 12.1C16.23 14.43 14.33 16.33 12 16.33ZM12 9.37C10.5 9.37 9.27 10.6 9.27 12.1C9.27 13.6 10.5 14.83 12 14.83C13.5 14.83 14.73 13.6 14.73 12.1C14.73 10.6 13.5 9.37 12 9.37Z" fill="#180149"/>
                        <path d="M12 21.02C8.24 21.02 4.69 18.82 2.25 15C1.19 13.35 1.19 10.66 2.25 9C4.7 5.18 8.25 2.98 12 2.98C15.75 2.98 19.3 5.18 21.75 9C22.81 10.65 22.81 13.34 21.75 15C19.3 18.82 15.75 21.02 12 21.02ZM12 4.48C8.77 4.48 5.68 6.42 3.52 9.81C2.77 10.98 2.77 13.02 3.52 14.19C5.68 17.58 8.77 19.52 12 19.52C15.23 19.52 18.32 17.58 20.48 14.19C21.23 13.02 21.23 10.98 20.48 9.81C18.32 6.42 15.23 4.48 12 4.48Z" fill="#180149"/>
                      </svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9.47 15.28C9.28 15.28 9.09 15.21 8.94 15.06C8.12 14.24 7.67 13.15 7.67 12C7.67 9.61 9.61 7.67 12 7.67C13.15 7.67 14.24 8.12 15.06 8.94C15.2 9.08 15.28 9.27 15.28 9.47C15.28 9.67 15.2 9.86 15.06 10L10 15.06C9.85 15.21 9.66 15.28 9.47 15.28ZM12 9.17C10.44 9.17 9.17 10.44 9.17 12C9.17 12.5 9.3 12.98 9.54 13.4L13.4 9.54C12.98 9.3 12.5 9.17 12 9.17Z" fill="#180149"/>
                        <path d="M5.6 18.51C5.43 18.51 5.25 18.45 5.11 18.33C4.04 17.42 3.08 16.3 2.26 15C1.2 13.35 1.2 10.66 2.26 9C4.7 5.18 8.25 2.98 12 2.98C14.2 2.98 16.37 3.74 18.27 5.17C18.6 5.42 18.67 5.89 18.42 6.22C18.17 6.55 17.7 6.62 17.37 6.37C15.73 5.13 13.87 4.48 12 4.48C8.77 4.48 5.68 6.42 3.52 9.81C2.77 10.98 2.77 13.02 3.52 14.19C4.27 15.36 5.13 16.37 6.08 17.19C6.39 17.46 6.43 17.93 6.16 18.25C6.02 18.42 5.81 18.51 5.6 18.51Z" fill="#180149"/>
                        <path d="M12 21.02C10.67 21.02 9.37 20.75 8.12 20.22C7.74 20.06 7.56 19.62 7.72 19.24C7.88 18.86 8.32 18.68 8.7 18.84C9.76 19.29 10.87 19.52 11.99 19.52C15.22 19.52 18.31 17.58 20.47 14.19C21.22 13.02 21.22 10.98 20.47 9.81C20.16 9.32 19.82 8.85 19.46 8.41C19.2 8.09 19.25 7.62 19.57 7.35C19.89 7.09 20.36 7.13 20.63 7.46C21.02 7.94 21.4 8.46 21.74 9C22.8 10.65 22.8 13.34 21.74 15C19.3 18.82 15.75 21.02 12 21.02Z" fill="#180149"/>
                        <path d="M2 22.75C1.81 22.75 1.62 22.68 1.47 22.53C1.18 22.24 1.18 21.76 1.47 21.47L8.94 13.999C9.23 13.71 9.71 13.71 10 13.999C10.29 14.29 10.29 14.77 10 15.06L2.53 22.53C2.38 22.68 2.19 22.75 2 22.75Z" fill="#180149"/>
                        <path d="M14.53 10.22C14.34 10.22 14.15 10.15 14 10C13.71 9.71 13.71 9.23 14 8.94L21.47 1.47C21.76 1.18 22.24 1.18 22.53 1.47C22.82 1.76 22.82 2.24 22.53 2.53L15.06 10C14.91 10.15 14.72 10.22 14.53 10.22Z" fill="#180149"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="login-forgot-link">
                <a href="#" className="login-link">{t('login.forgotPassword')}</a>
              </div>
            </div>

            <div className="login-actions">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 py-[17px] rounded-[1000px] bg-[#180149] text-white font-poppins text-base font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isLoading ? t('common.loading') : t('login.loginButton')}
              </button>

              <div className="login-divider">
                <span className="login-divider-line" />
                <span className="login-divider-text">{t('login.orLoginWith')}</span>
                <span className="login-divider-line" />
              </div>

              <GoogleLoginButton onSuccess={handleSuccess} onError={handleError} />
            </div>
          </form>

          <p className="login-register-text">
{t('login.noAccount')}{' '}
            <Link to="/register" className="login-link login-link-underline">{t('login.signUp')}</Link>
          </p>
        </div>

        {/* Right: Photo grid */}
        <div className="login-photo-grid">
          <img
            src="https://api.builder.io/api/v1/image/assets/TEMP/204e5b41cf4b024bf575ab2f43cda6fd3787b71f?width=1400"
            alt="Enlite care moments"
            className="login-photo-mosaic"
          />
        </div>
      </div>
    </div>
  );
}
