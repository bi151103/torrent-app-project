import React, { useState } from 'react';
import MessageType from './utils/MessageType';

interface RegisterPageProps {
  trackerWs: WebSocket | null;
  peerIp: string | null;
  peerPort: number | null;
  onLoginClick: () => void;
  onErrorMessage: (message: string) => void;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ trackerWs, peerIp, peerPort, onLoginClick, onErrorMessage }) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const handleRegister = () => {
    if (trackerWs && peerIp && peerPort) {
      trackerWs.send(JSON.stringify({
        type: MessageType.REGISTER,
        username,
        password,
      }));
    }
  };

  return (
    <div>
      <h2>Register</h2>
      <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={handleRegister}>Register</button>
      <p>Already have an account? <button onClick={onLoginClick}>Login</button></p>
    </div>
  );
};

export default RegisterPage;