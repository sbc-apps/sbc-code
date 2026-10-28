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
  const attachedFiles = document.getElementById('attachments');

  let busy = false;
  let pendingSubmit = false;
  let pendingPrompt = '';
  let currentAssistant = null;

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
    send.disabled = next || pendingSubmit;
    stop.hidden = !next;
  }

  function scrollBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function addText(container, content) {
    if (!content) {
      return;
    }
    const element = document.createElement('span');
    element.textContent = content;
    container.appendChild(element);
  }

  // Render fenced source blocks with textContent; never interpret model output as HTML.
  function renderMessageContent(container, rawText) {
    container.replaceChildren();
    const fence = String.fromCharCode(96).repeat(3);
    const codeBlock = new RegExp(fence + '([^\\r\\n]*)\\r?\\n([\\s\\S]*?)' + fence, 'g');
    let cursor = 0;
    let match;
    while ((match = codeBlock.exec(rawText))) {
      addText(container, rawText.slice(cursor, match.index));
      const codePanel = document.createElement('section');
      codePanel.className = 'code-panel';
      const codeHeader = document.createElement('div');
      codeHeader.className = 'code-header';
      const language = document.createElement('span');
      language.textContent = match[1].trim().slice(0, 40) || 'code';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'copy-code';
      copy.textContent = 'Copy code';
      const codeText = match[2];
      copy.addEventListener('click', function () {
        post('copy', { text: codeText });
      });
      codeHeader.appendChild(language);
      codeHeader.appendChild(copy);
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = codeText;
      pre.appendChild(code);
      codePanel.appendChild(codeHeader);
      codePanel.appendChild(pre);
      container.appendChild(codePanel);
      cursor = match.index + match[0].length;
    }
    addText(container, rawText.slice(cursor));
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
    const timeline = document.createElement('div');
    timeline.className = 'activity-timeline';
    timeline.hidden = true;
    const content = document.createElement('div');
    content.className = 'message-content';
    renderMessageContent(content, text);
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'copy-button';
    copyButton.textContent = 'Copy response';
    const message = { content: content, timeline: timeline, raw: text, rows: new Map() };
    copyButton.addEventListener('click', function () {
      post('copy', { text: message.raw });
    });
    article.appendChild(label);
    article.appendChild(timeline);
    article.appendChild(content);
    article.appendChild(copyButton);
    messages.appendChild(article);
    scrollBottom();
    return message;
  }

  function showActivity(data) {
    if (!currentAssistant || !['thinking', 'started', 'finished'].includes(data.state)) {
      return;
    }
    const timeline = currentAssistant.timeline;
    timeline.hidden = false;
    const name = String(data.step || 'Agent').slice(0, 100);
    if (data.state === 'thinking') {
      const row = document.createElement('div');
      row.className = 'activity-row';
      row.textContent = '◌ ' + name;
      timeline.appendChild(row);
    } else if (data.state === 'started') {
      const row = document.createElement('div');
      row.className = 'activity-row in-progress';
      row.textContent = '◌ ' + name + ' · running';
      timeline.appendChild(row);
      if (typeof data.id === 'string') {
        currentAssistant.rows.set(data.id, row);
      }
    } else {
      let row = currentAssistant.rows.get(data.id);
      if (!row) {
        row = document.createElement('div');
        timeline.appendChild(row);
      }
      const label = data.result === 'error' ? 'error' : data.result === 'declined' ? 'declined' : 'done';
      row.className = 'activity-row ' + label;
      row.textContent = (label === 'done' ? '✓ ' : label === 'declined' ? '– ' : '! ') + name + ' · ' + label;
    }
    status.textContent = name;
    scrollBottom();
  }

  function showAttachments(files) {
    attachedFiles.replaceChildren();
    for (const name of files) {
      const item = document.createElement('span');
      item.className = 'attachment-chip';
      const label = document.createElement('span');
      label.textContent = name;
      label.title = name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Remove ' + name;
      remove.setAttribute('aria-label', 'Remove ' + name);
      remove.addEventListener('click', function () {
        post('removeFile', { file: name });
      });
      item.appendChild(label);
      item.appendChild(remove);
      attachedFiles.appendChild(item);
    }
    attachedFiles.hidden = files.length === 0;
  }

  function sendPrompt() {
    const text = prompt.value.trim();
    if (!text || busy || pendingSubmit) {
      return;
    }
    clearError();
    pendingSubmit = true;
    pendingPrompt = text;
    send.disabled = true;
    post('send', { prompt: text, attachSelection: attach.checked, agentMode: agent.checked });
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
  document.getElementById('restore').addEventListener('click', function () { post('restoreLastEdit'); });
  document.getElementById('attach-files').addEventListener('click', function () { post('attachFiles'); });
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
      case 'attachments':
        if (Array.isArray(data.files)) {
          showAttachments(data.files.filter((entry) => typeof entry === 'string'));
        }
        break;
      case 'status':
        status.textContent = data.message || '';
        break;
      case 'error':
        showError(data.message || 'Unknown error');
        if (pendingSubmit && !busy) {
          pendingSubmit = false;
          send.disabled = false;
        }
        break;
      case 'user':
        clearError();
        if (prompt.value.trim() === pendingPrompt) {
          prompt.value = '';
        }
        pendingSubmit = false;
        addMessage('user', data.text || '');
        break;
      case 'start':
        currentAssistant = addMessage('assistant', '');
        updateBusy(true);
        status.textContent = (data.mode || 'Chat') + ' running…';
        break;
      case 'activity':
        showActivity(data);
        break;
      case 'delta':
        if (currentAssistant) {
          currentAssistant.raw += data.text || '';
          renderMessageContent(currentAssistant.content, currentAssistant.raw);
          scrollBottom();
        }
        break;
      case 'done':
        pendingSubmit = false;
        updateBusy(false);
        currentAssistant = null;
        break;
      case 'cleared':
        messages.replaceChildren();
        currentAssistant = null;
        pendingSubmit = false;
        updateBusy(false);
        clearError();
        break;
    }
  });

  post('ready');
})();
