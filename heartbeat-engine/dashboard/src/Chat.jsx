import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

function Chat({ theme }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      text: inputText,
      isUser: true,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: inputText }),
      });

      if (response.ok) {
        const data = await response.json();
        const sarahMessage = {
          id: Date.now() + 1,
          text: data.response,
          isUser: false,
          timestamp: new Date().toLocaleTimeString(),
        };
        setMessages(prev => [...prev, sarahMessage]);
      } else {
        throw new Error('Failed to get response');
      }
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        text: 'Sorry, I\'m having trouble connecting right now. Please try again.',
        isUser: false,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 140px)',
      backgroundColor: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      overflow: 'hidden',
    },
    header: {
      padding: 16,
      borderBottom: `1px solid ${theme.border}`,
      backgroundColor: theme.bg,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: 600,
      color: theme.text,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      color: theme.textMuted,
    },
    messagesContainer: {
      flex: 1,
      padding: 16,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    message: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 8,
      maxWidth: '70%',
    },
    messageUser: {
      alignSelf: 'flex-end',
      flexDirection: 'row-reverse',
    },
    messageBot: {
      alignSelf: 'flex-start',
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 600,
      color: 'white',
      flexShrink: 0,
    },
    avatarUser: {
      backgroundColor: theme.textMuted,
    },
    avatarBot: {
      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
    },
    messageBubble: {
      padding: '12px 16px',
      borderRadius: 18,
      fontSize: 14,
      lineHeight: 1.4,
      wordBreak: 'break-word',
      position: 'relative',
      marginBottom: '2px',
    },
    messageBubbleUser: {
      backgroundColor: '#E5E5EA',
      color: '#000',
      borderBottomRightRadius: '4px', // Reduced for tail
    },
    messageBubbleSarah: {
      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
      color: 'white',
      borderBottomLeftRadius: '4px', // Reduced for tail
    },
    messageTime: {
      fontSize: 11,
      opacity: 0.6,
      marginTop: 4,
      textAlign: 'center',
      color: theme.textMuted,
    },
    // Bubble wrapper for positioning tails
    bubbleWrapper: {
      position: 'relative',
      display: 'inline-block',
      maxWidth: '70%',
    },
    bubbleWrapperUser: {
      marginLeft: 'auto',
    },
    bubbleWrapperSarah: {
      marginRight: 'auto',
    },
    // Markdown styling inside bubbles
    markdownContent: {
      '& p': {
        margin: '0 0 8px 0',
      },
      '& p:last-child': {
        margin: 0,
      },
      '& ul, & ol': {
        margin: '8px 0',
        paddingLeft: '20px',
      },
      '& li': {
        margin: '4px 0',
      },
      '& strong': {
        fontWeight: 600,
      },
      '& h1, & h2, & h3': {
        margin: '8px 0 4px 0',
        fontWeight: 600,
        lineHeight: 1.2,
      },
      '& h1': { fontSize: '16px' },
      '& h2': { fontSize: '15px' },
      '& h3': { fontSize: '14px' },
    },
    inputContainer: {
      padding: 16,
      borderTop: `1px solid ${theme.border}`,
      backgroundColor: theme.bg,
    },
    inputWrapper: {
      display: 'flex',
      gap: 8,
      alignItems: 'flex-end',
    },
    input: {
      flex: 1,
      padding: '12px 16px',
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      fontSize: 14,
      backgroundColor: theme.surface,
      color: theme.text,
      resize: 'none',
      minHeight: 20,
      maxHeight: 100,
      outline: 'none',
      fontFamily: 'inherit',
    },
    sendButton: {
      padding: '12px 16px',
      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
      color: 'white',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'opacity 0.2s',
    },
    sendButtonDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    welcomeMessage: {
      textAlign: 'center',
      padding: 40,
      color: theme.textMuted,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>Chat with Sarah</div>
        <div style={styles.headerSubtitle}>
          Ask about her work, recent activities, or give her instructions
        </div>
      </div>

      <div style={styles.messagesContainer}>
        {messages.length === 0 ? (
          <div style={styles.welcomeMessage}>
            Hi! I'm Sarah Rodriguez, your autonomous operations agent for BLOOM Ecosystem.
            <br />
            Ask me about my recent work or give me new tasks!
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              style={{
                ...styles.message,
                ...(message.isUser ? styles.messageUser : styles.messageBot),
              }}
            >
              <div
                style={{
                  ...styles.avatar,
                  ...(message.isUser ? styles.avatarUser : styles.avatarBot),
                }}
              >
                {message.isUser ? 'U' : 'SR'}
              </div>
              <div style={{
                ...styles.bubbleWrapper,
                ...(message.isUser ? styles.bubbleWrapperUser : styles.bubbleWrapperSarah),
              }}>
                <div
                  style={{
                    ...styles.messageBubble,
                    ...(message.isUser ? styles.messageBubbleUser : styles.messageBubbleSarah),
                  }}
                >
                  {message.isUser ? (
                    message.text
                  ) : (
                    <div style={styles.markdownContent}>
                      <ReactMarkdown>{message.text}</ReactMarkdown>
                    </div>
                  )}
                </div>
                {/* Speech bubble tail */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '2px',
                    ...(message.isUser ? {
                      right: '-6px',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid #E5E5EA',
                      borderBottom: '6px solid transparent',
                    } : {
                      left: '-6px',
                      width: 0,
                      height: 0,
                      borderRight: `6px solid ${theme.accent}`,
                      borderBottom: '6px solid transparent',
                    })
                  }}
                />
                <div style={styles.messageTime}>{message.timestamp}</div>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div style={{ ...styles.message, ...styles.messageBot }}>
            <div style={{ ...styles.avatar, ...styles.avatarBot }}>SR</div>
            <div>
              <div style={{ ...styles.messageBubble, ...styles.messageBubbleSarah }}>
                Thinking...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputContainer}>
        <div style={styles.inputWrapper}>
          <textarea
            style={styles.input}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Message Sarah..."
            disabled={isLoading}
            rows={1}
          />
          <button
            style={{
              ...styles.sendButton,
              ...((!inputText.trim() || isLoading) ? styles.sendButtonDisabled : {}),
            }}
            onClick={sendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;