const REPLACE_QUOTES = {
    "‘": "'", "’": "'", "‚": "'", "ʼ": "'", "`": "'", "‹": "'", "›": "'",
    "„": "\"", "“": "\"", "”": "\"", "«": "\"", "»": "\""
};
const REPLACE_DASHES = {
    "—": "-", "–": "-", "‐": "-", "−": "-"
};
const REPLACE_SPACES = {
    " ": " ", " ": " ", " ": " ", "　": " ", " ": ""
};
const REPLACE_OTHER = {
    "…": "...",
    "е": "e"
};

let userSettings = {
    replaceQuotes: true,
    replaceDashes: false,
    replaceSpaces: true,
    replaceOther: true
};

function loadSettings() {
    chrome.storage.sync.get(
        {
            replaceQuotes: true,
            replaceDashes: false,
            replaceSpaces: true,
            replaceOther: true
        },
        (items) => {
            userSettings = items;
        }
    );
}

loadSettings();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        for (let key in changes) {
            userSettings[key] = changes[key].newValue;
        }
    }
});

function getCleanedText(s) {
    if (!s || typeof s !== 'string') return "";
    let text = s;

    let activeReplacements = {};
    if (userSettings.replaceQuotes) Object.assign(activeReplacements, REPLACE_QUOTES);
    if (userSettings.replaceDashes) Object.assign(activeReplacements, REPLACE_DASHES);
    if (userSettings.replaceSpaces) Object.assign(activeReplacements, REPLACE_SPACES);
    if (userSettings.replaceOther) Object.assign(activeReplacements, REPLACE_OTHER);

    for (const charToReplace in activeReplacements) {
        if (text.includes(charToReplace)) {
            const escapedKey = charToReplace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            text = text.replace(new RegExp(escapedKey, 'g'), activeReplacements[charToReplace]);
        }
    }
    return text.trim();
}

function scrapeLyricsFromPage() {
    const mainSelectors = [
        'div[data-lyrics-container="true"]', 'div[data-lyrics-container]', '.lyrics',
        '[class^="Lyrics__Container"]', '[class*="Lyrics__Container"]'
    ];
    const exclusionSelector = '[data-exclude-from-selection="true"]';
    const finalQuerySelector = mainSelectors.map(sel => `${sel}:not(${exclusionSelector})`).join(', ');
    const lyricsContainers = document.querySelectorAll(finalQuerySelector);

    function getTextWithLineBreaks(element) {
        let result = '';
        element.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches && node.matches(exclusionSelector)) return;
                if (node.tagName === 'BR') {
                    result += '\n';
                } else if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
                    result += getTextWithLineBreaks(node);
                }
            }
        });
        return result;
    }

    if (lyricsContainers && lyricsContainers.length > 0) {
        let lyricsBuilder = "";
        lyricsContainers.forEach(cont => {
            const currentText = getTextWithLineBreaks(cont).trim();
            if (currentText) lyricsBuilder += currentText + '\n\n';
        });
        return lyricsBuilder.trim();
    }
    return "";
}

function copyTextToClipboardOnPageContext(textToCopy) {
    return navigator.clipboard.writeText(textToCopy)
        .then(() => true)
        .catch(() => false);
}

async function showSuccessFeedback(tabId) {
    try {
        await chrome.action.setBadgeText({ text: "✓", tabId: tabId });
        await chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId: tabId });

        setTimeout(() => {
            chrome.action.setBadgeText({ text: "", tabId: tabId }).catch(() => {});
        }, 2000);
    } catch (e) {
    }
}

async function showErrorPopup(tabId, errorMessage) {
    const popupUrl = `error.html?message=${encodeURIComponent(errorMessage)}`;
    try {
        await chrome.action.setPopup({ tabId: tabId, popup: popupUrl });
        await chrome.action.openPopup();
    } catch (e) {
    }
}

function copyTextToClipboardOnPageContext(textToCopy) {
    try {
        return navigator.clipboard.writeText(textToCopy)
            .then(() => { return { success: true }; })
            .catch(err => {
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy;

                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.top = "0";
                document.body.appendChild(textArea);

                textArea.focus();
                textArea.select();

                return new Promise((resolve, reject) => {
                    let success = false;
                    try {
                        success = document.execCommand('copy');
                    } catch (e) {
                    }
                    document.body.removeChild(textArea);

                    if (success) {
                        resolve({ success: true });
                    } else {
                        resolve({ success: false, error: "Both writeText and execCommand failed." });
                    }
                });
            });
    } catch (e) {
         return { success: false, error: e.message };
    }
}

async function runGeniusCopyFlow(tabId, tabUrl) {
    if (!tabUrl || !tabUrl.toLowerCase().includes("genius.com/")) {
        await showErrorPopup(tabId, "This extension only works on Genius.com song lyrics pages.");
        return;
    }

    try {
        await chrome.action.setPopup({ tabId: tabId, popup: "" });
        await chrome.action.setBadgeText({ text: "", tabId: tabId });
    } catch (e) { }

    let scrapeResults;
    try {
        scrapeResults = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: scrapeLyricsFromPage
        });
    } catch (e) {
        if (e.message && e.message.includes("No tab with id")) throw e;

        await showErrorPopup(tabId, `An unexpected error occurred: ${e.message}`);
        return;
    }

    if (scrapeResults && scrapeResults[0] && typeof scrapeResults[0].result === 'string') {
        let rawLyrics = scrapeResults[0].result;

        if (rawLyrics.length > 0) {
            const lyricsToCopy = getCleanedText(rawLyrics);

            const copyResults = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                function: copyTextToClipboardOnPageContext,
                args: [lyricsToCopy]
            });

            if (copyResults && copyResults[0] && copyResults[0].result && copyResults[0].result.success === true) {
                await showSuccessFeedback(tabId);
            } else {
                await showErrorPopup(tabId, "Lyrics could not be copied. Browser blocked clipboard access.");
            }
        } else {
            await showErrorPopup(tabId, "No lyrics found on this page.");
        }
    } else {
        await showErrorPopup(tabId, "Lyrics could not be extracted from the page.");
    }
}

chrome.action.onClicked.addListener(async (tab) => {
    try {
        await runGeniusCopyFlow(tab.id, tab.url);
    } catch (e) {
        if (e.message && e.message.includes("No tab with id")) {
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs && tabs.length > 0) {
                    const activeTab = tabs[0];
                    await runGeniusCopyFlow(activeTab.id, activeTab.url);
                }
            } catch (retryError) {
            }
        }
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