import React from "react";
import "./LoginPage.css";

type LoginPageProps = {
  onLogin: () => void;
};

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  return (
    <div className="login-bg">
      <div className="login-card">
        <h1>🌟 ログインしよっ！🌟</h1>
        <p>グリーンで爽やかに、今日も元気にログインしちゃお！</p>
        <button className="login-btn" onClick={onLogin}>ログイン</button>
      </div>
    </div>
  );
};

export default LoginPage;
