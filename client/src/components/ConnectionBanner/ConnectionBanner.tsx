interface ConnectionBannerProps {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
}

export function ConnectionBanner({ status }: ConnectionBannerProps) {
  if (status === 'connected') return null;

  const messages: Record<string, { text: string; className: string }> = {
    connecting: { text: '🔌 Connecting to server…', className: 'banner-info' },
    reconnecting: { text: '🔄 Reconnecting… your session is preserved', className: 'banner-warn' },
    disconnected: { text: '❌ Connection lost. Please refresh.', className: 'banner-error' },
  };

  const { text, className } = messages[status] ?? messages.disconnected;

  return (
    <div className={`connection-banner ${className}`}>
      {text}
    </div>
  );
}
