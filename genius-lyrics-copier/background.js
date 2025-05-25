const _CharsToReplace = {
    "’": "'", "‚": "'", "„": "\"", "“": "\"", "”": "\"", "е": "e", "—": "-",
};

function getCleanedText(s) {
    if (!s || typeof s !== 'string') return { Text: "", HasReplaced: false };
    let hasReplaced = false;
    let text = s;
    for (const charToReplace in _CharsToReplace) {
        if (text.includes(charToReplace)) {
            const escapedKey = charToReplace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            text = text.replace(new RegExp(escapedKey, 'g'), _CharsToReplace[charToReplace]);
            hasReplaced = true;
        }
    }
    return { Text: text.trim(), HasReplaced: hasReplaced };
}

function scrapeLyricsFromPage() {
    const mainSelectors = [
        'div[data-lyrics-container="true"]', 'div[data-lyrics-container]', '.lyrics',
        '[class^="Lyrics__Container"]', '[class*="Lyrics__Container"]'
    ];
    const exclusionSelector = '[data-exclude-from-selection="true"]';
    const finalQuerySelector = mainSelectors.map(sel => `${sel}:not(${exclusionSelector})`).join(', ');
    const lyricsContainers = document.querySelectorAll(finalQuerySelector);
    if (lyricsContainers && lyricsContainers.length > 0) {
        let lyricsBuilder = "";
        lyricsContainers.forEach(cont => {
            let currentText = "";
            cont.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    currentText += node.textContent;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.matches && node.matches(exclusionSelector)) return;
                    if (node.tagName === 'BR') currentText += '\n';
                    else if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') currentText += node.innerText || "";
                }
            });
            const trimmedCurrentText = currentText.trim();
            if (trimmedCurrentText) lyricsBuilder += trimmedCurrentText + '\n\n';
        });
        return lyricsBuilder.trim();
    }
    return "";
}

function copyTextToClipboardOnPageContext(textToCopy) {
    return navigator.clipboard.writeText(textToCopy)
        .then(() => true)
        .catch(err => {
            console.error('Page context: Error copying to clipboard:', err);
            return false;
        });
}


async function showSuccessFeedback(tabId) {
  console.log(`[SuccessBadge] Showing success badge for tab ${tabId}`);
  chrome.action.setBadgeText({ text: "✓", tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId: tabId });

  setTimeout(() => {
    chrome.action.setBadgeText({ text: "", tabId: tabId });
  }, 2000);
}

async function showErrorPopup(tabId, errorMessage) {
  console.log(`[Popup] Showing error popup for tab ${tabId} with message: "${errorMessage}"`);
  const popupUrl = `error.html?message=${encodeURIComponent(errorMessage)}`;
  
  try {
    await chrome.action.setPopup({ tabId: tabId, popup: popupUrl });
    await chrome.action.openPopup();
  } catch (e) {
    console.error("[Popup] Error setting or opening error popup:", e);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
    console.log('[Action] Icon clicked. Tab URL:', tab.url);

    try {
        await chrome.action.setPopup({ tabId: tab.id, popup: "" });
        await chrome.action.setBadgeText({ text: "", tabId: tab.id });
    } catch (e) {
        console.warn("[Action] Error resetting popup/badge (ignored):", e);
    }

    if (tab.url && tab.url.toLowerCase().includes("genius.com/")) {
        console.log('[Action] URL is a Genius.com URL.');
        try {
            console.log('[Action] Attempting to scrape lyrics...');
            const scrapeResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: scrapeLyricsFromPage
            });
            console.log('[Action] Scrape result:', scrapeResults);

            if (scrapeResults && scrapeResults[0] && typeof scrapeResults[0].result === 'string') {
                let rawLyrics = scrapeResults[0].result;
                console.log('[Action] Raw lyrics found, length:', rawLyrics.length);
                
                if (rawLyrics.length > 0) {
                    const cleanedResult = getCleanedText(rawLyrics);
                    const lyricsToCopy = cleanedResult.Text;
                    console.log('[Action] Lyrics cleaned. Attempting to copy to clipboard...');

                    const copyResults = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        function: copyTextToClipboardOnPageContext,
                        args: [lyricsToCopy]
                    });
                    console.log('[Action] Copy attempt result:', copyResults);

                    if (copyResults && copyResults[0] && copyResults[0].result === true) {
                        console.log('[Action] Successfully copied to clipboard.');
                        await showSuccessFeedback(tab.id);
                    } else {
                        console.error('[Action] Error copying to clipboard.');
                        await showErrorPopup(tab.id, "Lyrics could not be copied to the clipboard. (Content script error)");
                        if (copyResults && copyResults[0] && copyResults[0].error) {
                             console.error("[Action] Content script copy error:", copyResults[0].error);
                        }
                    }
                } else {
                    console.log('[Action] No raw lyrics found on the page (empty string).');
                    await showErrorPopup(tab.id, "No lyrics found on this page.");
                }
            } else {
                console.error('[Action] Could not extract lyrics.');
                await showErrorPopup(tab.id, "Lyrics could not be extracted from the page.");
                if (scrapeResults && scrapeResults[0] && scrapeResults[0].error) {
                     console.error("[Action] Injection error (scraping):", scrapeResults[0].error);
                }
            }
        } catch (e) {
            console.error("[Action] Unexpected error in action handler:", e);
            await showErrorPopup(tab.id, `An unexpected error occurred: ${e.message}`);
        }
    } else {
        console.log('[Action] URL is NOT a Genius.com URL.');
        await showErrorPopup(tab.id, "This extension only works on Genius.com song lyrics pages.");
    }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable();

  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    const rules = [{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostSuffix: '.genius.com', schemes: ['http', 'https'] },
        }),
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: 'genius.com', schemes: ['http', 'https'] },
        })
      ],
      actions: [new chrome.declarativeContent.ShowAction()]
    }];
    chrome.declarativeContent.onPageChanged.addRules(rules);
  });
});