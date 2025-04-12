import React, { useState } from 'react';
import MessageType from './utils/MessageType';

interface LoginPageProps {
  trackerWs: WebSocket | null;
  peerIp: string | null;
  peerPort: number | null;
  onErrorMessage: (message: string) => void;
  onRegisterClick: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ trackerWs, peerIp, peerPort, onErrorMessage, onRegisterClick }) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const handleLogin = () => {
    if (trackerWs && peerIp && peerPort) {
      trackerWs.send(JSON.stringify({
        type: MessageType.SIGN_IN,
        username,
        password,
      }));
    }
  };

  return (
    <div>
      <h2>Login</h2>
      <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
      <p>Don't have an account? <button onClick={onRegisterClick}>Register</button></p>
    </div>
  );
};

export default LoginPage;