
const saveOptions = () => {
    const replaceQuotes = document.getElementById('replaceQuotes').checked;
    const replaceDashes = document.getElementById('replaceDashes').checked;
    const replaceSpaces = document.getElementById('replaceSpaces').checked;
    const replaceOther = document.getElementById('replaceOther').checked;

    chrome.storage.sync.set(
      {
        replaceQuotes: replaceQuotes,
        replaceDashes: replaceDashes,
        replaceSpaces: replaceSpaces,
        replaceOther: replaceOther
      },
      () => {

        const status = document.getElementById('status');
        status.textContent = 'Options saved.';
        status.classList.add('show');
        setTimeout(() => {
            status.classList.remove('show');
        }, 1500);
      }
    );
  };


  const restoreOptions = () => {
    chrome.storage.sync.get(
      {
        replaceQuotes: true,
        replaceDashes: false,
        replaceSpaces: true,
        replaceOther: true
      },
      (items) => {
        document.getElementById('replaceQuotes').checked = items.replaceQuotes;
        document.getElementById('replaceDashes').checked = items.replaceDashes;
        document.getElementById('replaceSpaces').checked = items.replaceSpaces;
        document.getElementById('replaceOther').checked = items.replaceOther;
      }
    );
  };

  const resetDefaults = () => {
    document.getElementById('replaceQuotes').checked = true;
    document.getElementById('replaceDashes').checked = false;
    document.getElementById('replaceSpaces').checked = true;
    document.getElementById('replaceOther').checked = true;


    const status = document.getElementById('status');
    status.textContent = 'Defaults loaded. Click Save to apply.';
    status.classList.add('show');
    setTimeout(() => {
        status.classList.remove('show');
    }, 2000);
  };

  document.addEventListener('DOMContentLoaded', restoreOptions);
  document.getElementById('save').addEventListener('click', saveOptions);
  document.getElementById('reset').addEventListener('click', resetDefaults);
