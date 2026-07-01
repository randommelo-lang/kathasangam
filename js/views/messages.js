import { el, formatDate } from "../components.js";
import { conversationItemSkeleton, chatHistorySkeleton, emptyState } from "./shared.js";

export function renderMessages(ctx) {
  ctx = ctx || this;

  // Clear any existing poll interval
  if (ctx.ui.messagesPollInterval) {
    clearInterval(ctx.ui.messagesPollInterval);
    ctx.ui.messagesPollInterval = null;
  }

  if (!ctx.state.user) {
    ctx.view.appendChild(
      el("div", "empty", [
        el("h3", null, "Access Restricted"),
        el("p", null, "Please sign in to view and send direct messages."),
        el("button", { 
          class: "btn primary", 
          style: "margin-top: 15px;",
          onclick: function() { ctx.openAuthModal(); }
        }, "Sign In")
      ])
    );
    return;
  }

  // Set up the message view layout elements
  const layout = el("div", "messages-inbox-layout");
  
  const sidebar = el("div", "messages-sidebar", [
    el("div", "messages-sidebar-header", [
      el("h3", null, "Direct Messages")
    ])
  ]);
  
  const convoListContainer = el("ul", "messages-conversations-list", [
    conversationItemSkeleton(),
    conversationItemSkeleton(),
    conversationItemSkeleton()
  ]);
  sidebar.appendChild(convoListContainer);
  
  const chatPane = el("div", "messages-chat-pane");
  
  layout.appendChild(sidebar);
  layout.appendChild(chatPane);
  ctx.view.appendChild(layout);

  function showChatPaneSkeleton(otherUser) {
    chatPane.innerHTML = "";
    chatPane.dataset.activeUserId = otherUser.id;

    const initial = otherUser.username.charAt(0).toUpperCase();
    const headerAvatar = el("div", "messages-convo-avatar");
    if (otherUser.avatar_url) {
      headerAvatar.style.backgroundImage = `url('${otherUser.avatar_url}')`;
    } else {
      headerAvatar.textContent = initial;
    }

    const backBtn = el("button", {
      class: "btn text-btn messages-back-btn",
      onclick: function() {
        ctx.ui.activeConversationUserId = null;
        ctx.ui.activeConversationUser = null;
        loadActiveChat(true);
      }
    }, "← Back");

    const header = el("div", "messages-chat-header", [
      backBtn,
      headerAvatar,
      el("div", "messages-chat-title", otherUser.username)
    ]);

    const history = el("div", "messages-history", [
      chatHistorySkeleton(),
      chatHistorySkeleton(),
      chatHistorySkeleton()
    ]);

    chatPane.appendChild(header);
    chatPane.appendChild(history);
  }

  if (ctx.ui.activeConversationUserId && ctx.ui.activeConversationUser) {
    showChatPaneSkeleton(ctx.ui.activeConversationUser);
  } else {
    updateChatPane([], null);
  }

  // Define the sub-rendering functions
  function updateConvoList(conversations) {
    convoListContainer.innerHTML = "";
    
    // Check if we have a pending conversation that is not in the list yet
    let listToRender = [...conversations];
    if (ctx.ui.activeConversationUserId) {
      const exists = listToRender.some(c => c.other_user_id === ctx.ui.activeConversationUserId);
      if (!exists && ctx.ui.activeConversationUser) {
        // Insert temporary conversation details
        listToRender.unshift({
          other_user_id: ctx.ui.activeConversationUserId,
          other_username: ctx.ui.activeConversationUser.username,
          other_avatar_url: ctx.ui.activeConversationUser.avatar_url || "",
          last_message: "New conversation...",
          last_message_at: new Date().toISOString(),
          unread_count: 0
        });
      }
    }

    if (listToRender.length === 0) {
      convoListContainer.appendChild(
        el("div", { class: "empty", style: "padding: 20px; font-size: 0.85rem;" }, "No conversations yet.")
      );
      return;
    }

    listToRender.forEach(convo => {
      const isSelected = convo.other_user_id === ctx.ui.activeConversationUserId;
      const initial = convo.other_username.charAt(0).toUpperCase();
      
      const avatarEl = el("div", "messages-convo-avatar");
      if (convo.other_avatar_url) {
        avatarEl.style.backgroundImage = `url('${convo.other_avatar_url}')`;
      } else {
        avatarEl.textContent = initial;
      }

      const badge = convo.unread_count > 0 ? el("span", "messages-convo-unread-badge", convo.unread_count.toString()) : null;

      const item = el("li", {
        class: `messages-convo-item${isSelected ? " active" : ""}`,
        onclick: function() {
          if (ctx.ui.activeConversationUserId !== convo.other_user_id) {
            ctx.ui.activeConversationUserId = convo.other_user_id;
            ctx.ui.activeConversationUser = {
              id: convo.other_user_id,
              username: convo.other_username,
              avatar_url: convo.other_avatar_url
            };
            showChatPaneSkeleton(ctx.ui.activeConversationUser);
            loadActiveChat(true);
          }
        }
      }, [
        avatarEl,
        el("div", "messages-convo-details", [
          el("div", "messages-convo-top", [
            el("span", "messages-convo-name", convo.other_username),
            el("span", "messages-convo-time", convo.last_message_at ? formatDate(convo.last_message_at) : "")
          ]),
          el("div", { style: "display: flex; justify-content: space-between; align-items: center;" }, [
            el("span", "messages-convo-last", convo.last_message || ""),
            badge
          ].filter(Boolean))
        ])
      ]);

      convoListContainer.appendChild(item);
    });
  }

  function retryMessage(tempMsg) {
    if (!ctx.ui.activeConversationUserId) return;
    tempMsg.status = "pending";
    updateChatPane(ctx.ui.activeChatMessages, ctx.ui.activeConversationUser, false);

    ctx.apiPost("/messages", {
      receiver_id: ctx.ui.activeConversationUserId,
      content: tempMsg.content
    }).then(savedMsg => {
      const idx = ctx.ui.activeChatMessages.findIndex(m => m.id === tempMsg.id);
      if (idx !== -1) {
        ctx.ui.activeChatMessages[idx] = savedMsg;
      }
      updateChatPane(ctx.ui.activeChatMessages, ctx.ui.activeConversationUser, true);

      // Refresh list
      ctx.api("/messages").then(updateConvoList).catch(console.error);
    }).catch(err => {
      console.error("Retry failed:", err);
      tempMsg.status = "error";
      updateChatPane(ctx.ui.activeChatMessages, ctx.ui.activeConversationUser, false);
    });
  }

  function updateChatPane(messages, otherUser, shouldScroll) {
    if (!otherUser) {
      chatPane.innerHTML = "";
      delete chatPane.dataset.activeUserId;
      chatPane.appendChild(
        emptyState(
          "Direct Messages",
          "Select a conversation from the list or visit an author's profile to start chatting.",
          null,
          "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0 4h8v2H6v-2zm0-8h12v2H6V5z"
        )
      );
      return;
    }

    const currentActiveUserId = chatPane.dataset.activeUserId;
    const hasInputBar = chatPane.querySelector(".messages-chat-input-bar");

    if (currentActiveUserId === otherUser.id && hasInputBar) {
      // Just update the history bubbles
      const history = chatPane.querySelector(".messages-history");
      if (history) {
        const previousMessageCount = history.querySelectorAll(".messages-bubble-wrapper").length;
        history.innerHTML = "";
        
        if (messages.length === 0) {
          history.appendChild(
            emptyState(
              "No messages yet",
              "Send a greeting to start the conversation!",
              null,
              "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0 4h8v2H6v-2zm0-8h12v2H6V5z"
            )
          );
        } else {
          messages.forEach(msg => {
            const isMe = msg.sender_id === ctx.state.user.id;
            let statusClass = "";
            if (msg.status === "pending") {
              statusClass = " pending";
            } else if (msg.status === "error") {
              statusClass = " error";
            }

            const timeStr = formatDate(msg.created_at);
            const children = [
              el("div", "messages-chat-bubble", msg.content),
            ];

            if (msg.status === "error") {
              const retryBtn = el("button", {
                class: "messages-retry-btn",
                onclick: function() { retryMessage(msg); }
              }, "Retry ↻");
              children.push(el("div", "messages-chat-time error-time", [
                el("span", null, "Failed to send. "),
                retryBtn
              ]));
            } else {
              children.push(el("div", "messages-chat-time", timeStr + (msg.status === "pending" ? " • Sending..." : "")));
            }

            const bubbleWrapper = el("div", `messages-bubble-wrapper ${isMe ? "sent" : "received"}${statusClass}`, children);
            history.appendChild(bubbleWrapper);
          });
        }

        // Scroll to bottom if new messages have arrived or shouldScroll is true
        if (shouldScroll || messages.length !== previousMessageCount) {
          setTimeout(() => {
            history.scrollTop = history.scrollHeight;
          }, 50);
        }
      }
      return;
    }

    chatPane.innerHTML = "";
    chatPane.dataset.activeUserId = otherUser.id;

    const initial = otherUser.username.charAt(0).toUpperCase();
    const headerAvatar = el("div", "messages-convo-avatar");
    if (otherUser.avatar_url) {
      headerAvatar.style.backgroundImage = `url('${otherUser.avatar_url}')`;
    } else {
      headerAvatar.textContent = initial;
    }

    const backBtn = el("button", {
      class: "btn text-btn messages-back-btn",
      onclick: function() {
        ctx.ui.activeConversationUserId = null;
        ctx.ui.activeConversationUser = null;
        loadActiveChat(true);
      }
    }, "← Back");

    const header = el("div", "messages-chat-header", [
      backBtn,
      headerAvatar,
      el("div", "messages-chat-title", otherUser.username)
    ]);

    const history = el("div", "messages-history");
    
    if (messages.length === 0) {
      history.appendChild(
        emptyState(
          "No messages yet",
          "Send a greeting to start the conversation!",
          null,
          "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0 4h8v2H6v-2zm0-8h12v2H6V5z"
        )
      );
    } else {
      messages.forEach(msg => {
        const isMe = msg.sender_id === ctx.state.user.id;
        let statusClass = "";
        if (msg.status === "pending") {
          statusClass = " pending";
        } else if (msg.status === "error") {
          statusClass = " error";
        }

        const timeStr = formatDate(msg.created_at);
        const children = [
          el("div", "messages-chat-bubble", msg.content),
        ];

        if (msg.status === "error") {
          const retryBtn = el("button", {
            class: "messages-retry-btn",
            onclick: function() { retryMessage(msg); }
          }, "Retry ↻");
          children.push(el("div", "messages-chat-time error-time", [
            el("span", null, "Failed to send. "),
            retryBtn
          ]));
        } else {
          children.push(el("div", "messages-chat-time", timeStr + (msg.status === "pending" ? " • Sending..." : "")));
        }

        const bubbleWrapper = el("div", `messages-bubble-wrapper ${isMe ? "sent" : "received"}${statusClass}`, children);
        history.appendChild(bubbleWrapper);
      });
    }

    const inputField = el("input", {
      type: "text",
      class: "messages-chat-input",
      placeholder: "Type a message...",
      required: true,
      autocomplete: "off"
    });

    const sendForm = el("form", {
      class: "messages-chat-input-bar",
      onsubmit: function(e) {
        e.preventDefault();
        const content = inputField.value.trim();
        
        const existingError = chatPane.querySelector(".messages-feedback");
        if (existingError) existingError.remove();

        if (!content) {
          const errorMsg = el("div", "form-feedback error messages-feedback", "Message content cannot be empty. Please check your input and try again.");
          chatPane.insertBefore(errorMsg, sendForm);
          return;
        }

        const tempId = "temp-" + Date.now();
        const tempMsg = {
          id: tempId,
          sender_id: ctx.state.user.id,
          content: content,
          created_at: new Date().toISOString(),
          status: "pending"
        };

        if (!ctx.ui.activeChatMessages) {
          ctx.ui.activeChatMessages = [];
        }
        ctx.ui.activeChatMessages.push(tempMsg);
        inputField.value = "";
        
        updateChatPane(ctx.ui.activeChatMessages, otherUser, true);
        
        ctx.apiPost("/messages", {
          receiver_id: otherUser.id,
          content: content
        }).then(savedMsg => {
          const idx = ctx.ui.activeChatMessages.findIndex(m => m.id === tempId);
          if (idx !== -1) {
            ctx.ui.activeChatMessages[idx] = savedMsg;
          }
          updateChatPane(ctx.ui.activeChatMessages, otherUser, true);
          
          ctx.api("/messages").then(conversations => {
            updateConvoList(conversations);
          }).catch(console.error);
        }).catch(err => {
          console.error("Failed to send message:", err);
          const idx = ctx.ui.activeChatMessages.findIndex(m => m.id === tempId);
          if (idx !== -1) {
            ctx.ui.activeChatMessages[idx].status = "error";
          }
          updateChatPane(ctx.ui.activeChatMessages, otherUser, false);
        });
      }
    }, [
      inputField,
      el("button", { type: "submit", class: "btn primary" }, "Send")
    ]);

    inputField.addEventListener("input", function() {
      const existingError = chatPane.querySelector(".messages-feedback");
      if (existingError) existingError.remove();
    });

    chatPane.appendChild(header);
    chatPane.appendChild(history);
    chatPane.appendChild(sendForm);

    // Scroll to bottom helper
    setTimeout(() => {
      history.scrollTop = history.scrollHeight;
    }, 50);
  }

  function showConvoListError() {
    convoListContainer.innerHTML = "";
    convoListContainer.appendChild(
      el("div", { class: "empty-convo-error", style: "padding: 20px; text-align: center;" }, [
        el("p", { style: "color: var(--error); margin-bottom: 10px; font-size: 0.85rem;" }, "Failed to load inbox."),
        el("button", {
          class: "btn text-btn",
          style: "font-size: 0.8rem; color: var(--accent);",
          onclick: function() { loadActiveChat(true); }
        }, "Try again ↻")
      ])
    );
  }

  function showChatHistoryError(otherUser) {
    if (!otherUser) return;
    const headerAvatar = el("div", "messages-convo-avatar");
    const initial = otherUser.username.charAt(0).toUpperCase();
    if (otherUser.avatar_url) {
      headerAvatar.style.backgroundImage = `url('${otherUser.avatar_url}')`;
    } else {
      headerAvatar.textContent = initial;
    }

    const backBtn = el("button", {
      class: "btn text-btn messages-back-btn",
      onclick: function() {
        ctx.ui.activeConversationUserId = null;
        ctx.ui.activeConversationUser = null;
        loadActiveChat(true);
      }
    }, "← Back");

    const header = el("div", "messages-chat-header", [
      backBtn,
      headerAvatar,
      el("div", "messages-chat-title", otherUser.username)
    ]);

    const history = el("div", "messages-history", [
      emptyState(
        "Failed to load chat history",
        "There was an error loading the conversation. Please check your connection and try again.",
        el("button", {
          class: "btn primary",
          onclick: function() { loadActiveChat(true); }
        }, "Retry Loading"),
        "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
      )
    ]);

    chatPane.innerHTML = "";
    chatPane.appendChild(header);
    chatPane.appendChild(history);
  }

  // Load and refresh function
  function loadActiveChat(shouldScroll) {
    if (!ctx.state.user) return;

    if (ctx.ui.activeConversationUserId) {
      layout.classList.add("chat-active");
    } else {
      layout.classList.remove("chat-active");
    }

    // Load conversation summaries
    ctx.api("/messages")
      .then(conversations => {
        updateConvoList(conversations);
        
        // If there's an active conversation user, load messages history
        if (ctx.ui.activeConversationUserId) {
          ctx.api(`/messages/${ctx.ui.activeConversationUserId}`)
            .then(messages => {
              ctx.ui.activeChatMessages = messages;
              // Retrieve active user info from conversations list or cached public profile
              let activeUser = conversations.find(c => c.other_user_id === ctx.ui.activeConversationUserId);
              if (activeUser) {
                activeUser = {
                  id: activeUser.other_user_id,
                  username: activeUser.other_username,
                  avatar_url: activeUser.other_avatar_url
                };
              } else {
                activeUser = ctx.ui.activeConversationUser;
              }
              
              updateChatPane(messages, activeUser, shouldScroll);
            })
            .catch(err => {
              console.error("Failed to load message history:", err);
              showChatHistoryError(ctx.ui.activeConversationUser);
            });
        } else {
          updateChatPane([], null);
        }
      })
      .catch(err => {
        console.error("Failed to load conversations:", err);
        showConvoListError();
      });
  }

  // Initial load
  loadActiveChat(true);

  // Set up polling interval every 5 seconds
  ctx.ui.messagesPollInterval = setInterval(function() {
    if (ctx.ui.currentView !== "messages") {
      clearInterval(ctx.ui.messagesPollInterval);
      ctx.ui.messagesPollInterval = null;
      return;
    }
    loadActiveChat(false);
  }, 5000);
}
