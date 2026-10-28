'use strict';

(function () {
  const vscode = acquireVsCodeApi();
  const messages = document.getElementById('messages');
  const form = document.getElementById('composer');
  const prompt = document.getElementById('prompt');
  const attach = document.getElementById('attach');
  const agent = document.getElementById('agent');
  const models = document.getElementById('model');
  const status = document.getElementById('status');
  const errorBox = document.getElementById('error');
  const send = document.getElementById('send');
  const stop = document.getElementById('stop');
  let busy = false;
  let assistantText = null;

  function post(type, more) {
    vscode.postMessage(Object.assign({ type: type }, more || {}));
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function updateBusy(next) {
    busy = next;
    send.disabled = next;
    stop.hidden = !next;
  }

  function scrollBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(role, text) {
    const empty = messages.querySelector('.empty');
    if (empty) {
      empty.remove();
    }
    const article = document.createElement('article');
    article.className = 'message ' + role;
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = role === 'assistant' ? 'SBC Code' : 'You';
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'copy-button';
    copyButton.textContent = 'Copy';
    copyButton.title = 'Copy message';
    copyButton.addEventListener('click', function () {
      post('copy', { text: content.textContent });
    });
    article.appendChild(label);
    article.appendChild(content);
    article.appendChild(copyButton);
    messages.appendChild(article);
    scrollBottom();
    return content;
  }

  function sendPrompt() {
    const text = prompt.value.trim();
    if (!text || busy) {
      return;
    }
    clearError();
    post('send', { prompt: text, attachSelection: attach.checked, agentMode: agent.checked });
    prompt.value = '';
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    sendPrompt();
  });
  prompt.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendPrompt();
    }
  });
  stop.addEventListener('click', function () { post('cancel'); });
  document.getElementById('refresh').addEventListener('click', function () { post('refreshModels'); });
  document.getElementById('key').addEventListener('click', function () { post('setApiKey'); });
  document.getElementById('clear').addEventListener('click', function () { post('clear'); });
  models.addEventListener('change', function () {
    if (models.value) {
      post('setModel', { model: models.value });
    }
  });

  window.addEventListener('message', function (event) {
    const data = event.data;
    if (!data || typeof data.type !== 'string') {
      return;
    }
    switch (data.type) {
      case 'models': {
        const selected = data.selected || '';
        const all = Array.isArray(data.models) ? data.models.slice() : [];
        if (selected && all.indexOf(selected) === -1) {
          all.unshift(selected);
        }
        models.replaceChildren();
        if (!all.length) {
          const placeholder = document.createElement('option');
          placeholder.textContent = 'Select model via Command Palette';
          placeholder.value = '';
          models.appendChild(placeholder);
        }
        for (const name of all) {
          const option = document.createElement('option');
          option.textContent = name;
          option.value = name;
          models.appendChild(option);
        }
        models.value = selected || (all.length ? all[0] : '');
        break;
      }
      case 'status':
        status.textContent = data.message || '';
        break;
      case 'error':
        showError(data.message || 'Unknown error');
        break;
      case 'user':
        clearError();
        addMessage('user', data.text || '');
        break;
      case 'start':
        assistantText = addMessage('assistant', '');
        updateBusy(true);
        status.textContent = (data.mode || 'Chat') + ' running…';
        break;
      case 'activity': {
        status.textContent = data.message || 'Agent running…';
        break;
      }
      case 'delta':
        if (assistantText) {
          assistantText.textContent += data.text || '';
          scrollBottom();
        }
        break;
      case 'done':
        updateBusy(false);
        assistantText = null;
        break;
      case 'cleared':
        messages.replaceChildren();
        assistantText = null;
        clearError();
        break;
    }
  });

  post('ready');
})();
