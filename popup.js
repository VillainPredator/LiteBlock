// popup.js
let currentTab = 1;

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = parseInt(tab.dataset.tab);
    
    document.getElementById('tab1').style.display = currentTab === 1 ? 'block' : 'none';
    document.getElementById('tab2').style.display = currentTab === 2 ? 'block' : 'none';
  });
});

document.getElementById('executeBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.textContent = '正在扫描并处理...（请保持页面可见）';

  const inputText = currentTab === 1 
    ? document.getElementById('usernames').value 
    : document.getElementById('contents').value;

  const items = inputText.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);

  if (items.length === 0) {
    statusEl.textContent = '请输入至少一个条件';
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: batchBlockOnX,
      args: [items, currentTab]
    });

    const count = results[0]?.result || 0;
    statusEl.textContent = `✅ 已尝试处理 ${count} 个匹配用户（因延迟，可能需稍等）`;
  } catch (err) {
    statusEl.textContent = '❌ 执行失败，请刷新 X 页面后重试';
    console.error(err);
  }
});

// Batch block
function batchBlockOnX(items, mode) {
  let blockedCount = 0;
  const processed = new Set();

  const posts = document.querySelectorAll('article[role="article"], article[data-testid="tweet"], [data-testid="tweetDetail"] article');

  console.log(`[LiteBlock] 找到 ${posts.length} 条内容`);

  posts.forEach((post) => {
    const userContainer = post.querySelector('[data-testid="User-Name"]');
    if (!userContainer) return;

    // === 增强版：Query username + Handle + Bio ===
    let displayName = '';
    let handle = '';
    let bio = '';

    // 1. Query username 
    displayName = userContainer.textContent.trim().split('\n')[0].trim();
    if (!displayName || displayName.includes('·')) {
      const allSpans = userContainer.querySelectorAll('span');
      let nameParts = [];
      allSpans.forEach(span => {
        const text = span.textContent.trim();
        if (text && text.length > 0 && !text.includes('·') && !/^\d{1,2}$/.test(text)) {
          nameParts.push(text);
        }
      });
      displayName = nameParts.join('').trim();
    }

    // 2. Query @handle
    const links = userContainer.querySelectorAll('a[role="link"]');
    links.forEach(link => {
      const text = link.textContent.trim();
      if (text.startsWith('@')) handle = text;
    });

    // 3. Query Bio
    const bioEl = post.querySelector('[data-testid="UserDescription"]') || 
                  post.querySelector('div[dir="auto"] span');
    if (bioEl) bio = bioEl.textContent.trim();

    const fullSearchText = (displayName + ' ' + handle + ' ' + bio).toLowerCase().trim();

    console.log(`[LiteBlock] 用户: "${displayName}" | ${handle} | Bio: ${bio.substring(0, 50)}...`);

    // === Lower Case ===
    const lowerItems = items.map(item => item.trim().toLowerCase());

    let isMatch = false;
    if (mode === 1) { // 用户名模式
      isMatch = lowerItems.some(item => fullSearchText.includes(item));
    } else { // 发帖内容模式
      const tweetTextEl = post.querySelector('[data-testid="tweetText"]');
      const tweetText = (tweetTextEl ? tweetTextEl.textContent : post.textContent).toLowerCase();
      isMatch = lowerItems.some(item => tweetText.includes(item));
    }

    if (isMatch && !processed.has(handle || displayName)) {
      processed.add(handle || displayName);
      blockedCount++;

      console.log(`[LiteBlock] ✅ 匹配成功: ${displayName} ${handle}`);

      // 执行批量禁用
      const moreBtn = post.querySelector('[data-testid="caret"], button[aria-label*="更多"], button[aria-label*="More"]');
      if (moreBtn) {
        moreBtn.scrollIntoView({ behavior: "smooth", block: "center" });
        moreBtn.click();

        setTimeout(() => {
          const blockOption = document.querySelector('[data-testid="block"]') ||
            Array.from(document.querySelectorAll('[role="menuitem"], button')).find(el => 
              el.textContent.toLowerCase().includes('block') || 
              el.textContent.includes('屏蔽')
            );

          if (blockOption) {
            const btn = blockOption.closest('button, [role="menuitem"]') || blockOption;
            btn.click();

            setTimeout(() => {
              const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
              if (confirmBtn) {
                confirmBtn.click();
                console.log(`[LiteBlock] ✅ 已确认禁用: ${displayName}`);
              }
            }, 850);
          }
        }, 550);
      } else {
        console.log(`[LiteBlock] 未找到更多按钮`);
      }
    }
  });

  console.log(`[LiteBlock] 处理完成，成功匹配 ${blockedCount} 个用户`);
  return blockedCount;
}