import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

// Clarification Card — renders Sarah's question with clickable option buttons
function ClarificationCard({ clarification, onOptionSelect, theme, disabled }) {
  const [selectedOption, setSelectedOption] = useState(null);

  const handleSelect = (option, index) => {
    if (disabled || selectedOption !== null) return;
    setSelectedOption(index);
    onOptionSelect(option);
  };

  return (
    <div style={{
      backgroundColor: theme.surface,
      border: `2px solid ${theme.accent}`,
      borderRadius: 16,
      padding: 20,
      marginTop: 8,
      maxWidth: 400,
    }}>
      {/* Question */}
      <div style={{
        fontSize: 15,
        fontWeight: 600,
        color: theme.text,
        marginBottom: 6,
        lineHeight: 1.4,
      }}>
        {clarification.question}
      </div>

      {/* Context (if provided) */}
      {clarification.context && (
        <div style={{
          fontSize: 13,
          color: theme.textMuted,
          marginBottom: 14,
          lineHeight: 1.4,
        }}>
          {clarification.context}
        </div>
      )}

      {/* Option Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(clarification.options || []).map((option, index) => {
          const isSelected = selectedOption === index;
          const isDisabled = disabled || (selectedOption !== null && !isSelected);

          return (
            <button
              key={index}
              onClick={() => handleSelect(option, index)}
              disabled={isDisabled}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '12px 16px',
                borderRadius: 12,
                border: isSelected
                  ? `2px solid ${theme.accent}`
                  : `1px solid ${theme.border}`,
                backgroundColor: isSelected
                  ? `${theme.accent}15`
                  : isDisabled
                    ? `${theme.textMuted}10`
                    : theme.surface,
                cursor: isDisabled ? 'default' : 'pointer',
                opacity: isDisabled && !isSelected ? 0.5 : 1,
                transition: 'all 0.15s ease',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (!isDisabled) {
                  e.currentTarget.style.backgroundColor = `${theme.accent}10`;
                  e.currentTarget.style.borderColor = theme.accent;
                }
              }}
              onMouseLeave={(e) => {
                if (!isDisabled && !isSelected) {
                  e.currentTarget.style.backgroundColor = theme.surface;
                  e.currentTarget.style.borderColor = theme.border;
                }
              }}
            >
              <span style={{
                fontSize: 14,
                fontWeight: 600,
                color: isSelected ? theme.accent : theme.text,
                marginBottom: option.description ? 2 : 0,
              }}>
                {isSelected ? '\u2713 ' : ''}{option.label}
              </span>
              {option.description && (
                <span style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  lineHeight: 1.3,
                }}>
                  {option.description}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedOption !== null && (
        <div style={{
          fontSize: 12,
          color: theme.accent,
          marginTop: 10,
          fontWeight: 500,
        }}>
          Sarah is working on it...
        </div>
      )}
    </div>
  );
}

function Chat({ theme }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState('session-' + Date.now());
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (messageText) => {
    const text = messageText || inputText;
    if (!text.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      text: text,
      isUser: true,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, userMessage]);
    if (!messageText) setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.sessionId) setSessionId(data.sessionId);

        // Check if the response contains a clarification request
        if (data.clarification) {
          const clarifyMessage = {
            id: Date.now() + 1,
            text: data.response || '',
            isUser: false,
            timestamp: new Date().toLocaleTimeString(),
            clarification: data.clarification,
          };
          setMessages(prev => [...prev, clarifyMessage]);
        } else {
          const sarahMessage = {
            id: Date.now() + 1,
            text: data.response,
            isUser: false,
            timestamp: new Date().toLocaleTimeString(),
          };
          setMessages(prev => [...prev, sarahMessage]);
        }
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

  // Handle clarification option selection — sends the choice as a new message
  const handleClarificationSelect = (option) => {
    sendMessage(`${option.label}: ${option.description}`);
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
      fontSize: '15px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      lineHeight: '1.5',
      letterSpacing: '-0.01em',
      wordBreak: 'break-word',
      position: 'relative',
      marginBottom: '2px',
    },
    messageBubbleUser: {
      backgroundColor: '#E5E5EA',
      color: '#000',
      borderBottomRightRadius: '4px',
    },
    messageBubbleSarah: {
      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
      color: 'white',
      borderBottomLeftRadius: '4px',
    },
    messageTime: {
      fontSize: 11,
      opacity: 0.6,
      marginTop: 4,
      textAlign: 'center',
      color: theme.textMuted,
    },
    bubbleWrapper: {
      position: 'relative',
      maxWidth: '70%',
    },
    bubbleWrapperUser: {
      alignSelf: 'flex-end',
    },
    bubbleWrapperSarah: {
      alignSelf: 'flex-start',
    },
    inputContainer: {
      position: 'relative',
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


  // Handle quick action selection from + button menu
  const handleQuickAction = async (action) => {
    setQuickActionsOpen(false);
    if (action === 'build_website') {
      setIsLoading(true);
      const buildMessage = '🌐 Build a website for my business';
      // Add user message to UI immediately
      setMessages(prev => [...prev, { role: 'user', content: buildMessage }]);
      try {
        const res = await fetch('/api/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: buildMessage,
            sessionId,
            sessionType: 'website_build',
            action: 'build_website',
          }),
        });
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response || "I'm starting the website builder — I'll ask you a few questions to get the details right." }]);
        if (data.clarification) {
          setMessages(prev => [...prev, { role: 'assistant', content: null, clarification: data.clarification }]);
        }
      } catch (e) {
        setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't start the website builder. Please try again." }]);
      } finally {
        setIsLoading(false);
      }
    }
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
                    <ReactMarkdown
                      components={{
                        p: ({children}) => <p style={{margin: '0 0 10px 0'}}>{children}</p>,
                        ul: ({children}) => <ul style={{margin: '8px 0', paddingLeft: '24px'}}>{children}</ul>,
                        ol: ({children}) => <ol style={{margin: '8px 0', paddingLeft: '24px'}}>{children}</ol>,
                        li: ({children}) => <li style={{margin: '4px 0'}}>{children}</li>,
                        strong: ({children}) => <strong style={{fontWeight: 600}}>{children}</strong>,
                        h1: ({children}) => <h1 style={{margin: '12px 0 6px 0', fontWeight: 600}}>{children}</h1>,
                        h2: ({children}) => <h2 style={{margin: '12px 0 6px 0', fontWeight: 600}}>{children}</h2>,
                        h3: ({children}) => <h3 style={{margin: '12px 0 6px 0', fontWeight: 600}}>{children}</h3>,
                      }}
                    >
                      {message.text}
                    </ReactMarkdown>
                  )}
                </div>

                {/* Clarification Card — shows below Sarah's message bubble */}
                {message.clarification && (
                  <ClarificationCard
                    clarification={message.clarification}
                    onOptionSelect={handleClarificationSelect}
                    theme={theme}
                    disabled={isLoading}
                  />
                )}

                {/* Speech bubble tail */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: message.clarification ? 'auto' : '2px',
                    top: message.clarification ? '2px' : 'auto',
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
        {/* Quick actions popup */}
        {quickActionsOpen && (
          <div style={{
            position: 'absolute',
            bottom: 72,
            left: 16,
            backgroundColor: '#1e1e2e',
            border: '1px solid #3a3a5c',
            borderRadius: 12,
            padding: '8px 0',
            zIndex: 100,
            minWidth: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <button
              onClick={() => handleQuickAction('build_website')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                color: '#e2e8f0',
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2a2a4a'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span style={{ fontSize: 20 }}>🌐</span>
              <div>
                <div style={{ fontWeight: 600 }}>Build a website</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>AI-powered site builder</div>
              </div>
            </button>
          </div>
        )}

        <div style={{ ...styles.inputWrapper, position: 'relative' }}>
          {/* + button */}
          <button
            onClick={() => setQuickActionsOpen(o => !o)}
            disabled={isLoading}
            title="Quick actions"
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '1.5px solid #3a3a5c',
              background: quickActionsOpen ? '#3a3a5c' : 'transparent',
              color: '#94a3b8',
              fontSize: 22,
              lineHeight: 1,
              cursor: isLoading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
              transition: 'all 0.15s ease',
            }}
          >
            {quickActionsOpen ? '×' : '+'}
          </button>

          <textarea
            style={styles.input}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Message Sarah..."
            disabled={isLoading}
            rows={1}
            onClick={() => setQuickActionsOpen(false)}
          />
          <button
            style={{
              ...styles.sendButton,
              ...((!inputText.trim() || isLoading) ? styles.sendButtonDisabled : {}),
            }}
            onClick={() => sendMessage()}
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