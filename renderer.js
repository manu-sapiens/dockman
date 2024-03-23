const productWindowUrl = 'http://127.0.0.1:1688';

// --------------------------------------------------
document.addEventListener('DOMContentLoaded', () => 
{
  const terminal = document.getElementById('terminal');
  const errorTerminal = document.getElementById('errorTerminal');
  const startContainerBtn = document.getElementById('startContainer');
  const devToolsBtn = document.getElementById('devToolsButton');
  const openProductBtn = document.getElementById('openProductButton');
  const loadingUi = document.getElementById('loadingIndicator');
  const dockerInstalledStatus = document.getElementById('dockerInstalledStatus');
  const dockerRunningStatus = document.getElementById('dockerRunningStatus');
  const appInstalledStatus = document.getElementById('appInstalledStatus');
  const appRunningStatus = document.getElementById('appRunningStatus');
  const stripText = "omnitool-1  | ";
 
  // --------------------------------------------------
  // Function to check Docker installation and update button state
  /*
  async function renderer_checkDocker() 
  {
    const installed = await window.electronAPI.electron_checkDockerInstalled();
    //startContainerBtn.disabled = !installed;
  }
  */
 
  function renderer_appendToTerminal(message, isError = false) {
    let messageElement;

    // if message contains stripText anywhere, remove all occurences (replaces with empty string "")
    if (message.startsWith(stripText))
    {

      // replace all occurences of stripText  with "". Do not remove " " from the string
      message = message.replace(new RegExp(stripText, 'g'), " ");
    }

    if (isError) {

      let isWarning = message.includes("WARN") || message.includes("ECONNREFUSED");
      if (isWarning)
      {
        messageElement = `<span class="warning-text">${message}</span>`;
      }
      else
      {
        // Wrap the error message in a span with class `error-text`
        messageElement = `<span class="error-text">${message}</span>`;
        errorTerminal.innerHTML += `${messageElement}<br>`; // Use innerHTML to parse the HTML string
        errorTerminal.scrollTop = terminal.scrollHeight; // Auto-scroll to the bottom  
      }

  
    } 
    else 
    {
        // For regular messages, just use a text node or a span without special styling
        messageElement = message;
    }

    // Append the message element to the terminal
    terminal.innerHTML += `${messageElement}<br>`; // Use innerHTML to parse the HTML string
    terminal.scrollTop = terminal.scrollHeight; // Auto-scroll to the bottom
  }

  // Listen for Docker status updates from the main process
  window.electronAPI.receive('docker-installed-status', (message) => 
  {
    console.log(`[renderer.js] docker-installed-status message = ${message}`);
    
    // Update your UI based on the message
    dockerInstalledStatus.innerText = message;
  });

    // Listen for Docker status updates from the main process
    window.electronAPI.receive('docker-running-status', (message) => 
    {
      console.log(`[renderer.js] docker-running-status message = ${message}`);
      
      // Update your UI based on the message
      dockerRunningStatus.innerText = message;
    });
  
  

  // Listen for Container status updates from the main process
  window.electronAPI.receive('app-installed-status', (message) => 
  {
    console.log(`[renderer.js] app-installed-status message = ${message}`);
   
    // Update your UI based on the message
    appInstalledStatus.innerText = message;
  });

  // Listen for Container status updates from the main process
  window.electronAPI.receive('app-running-status', (message) => 
  {
    console.log(`[renderer.js] app-running-status message = ${message}`);
  
    // Update your UI based on the message
    appRunningStatus.innerText = message;
  });



  // --------------------------------------------------
  openProductBtn.addEventListener('click', () => 
  {
    window.electronAPI.electron_openProductWindow(productWindowUrl);
  });

  /*
  // Event listener for the start container button
  startContainerBtn.addEventListener('click', () => 
  {
    loadingUi.style.display = 'block'; // Show loading indicator
    window.electronAPI.electron_startContainer();
  });
  */

  // Event listener for the dev tools button
  devToolsBtn.addEventListener('click', () => 
  {
    window.electronAPI.electron_toggleDevTools();
  });

  // Listen for messages from the main process
  window.electronAPI.receive('docker-output', (data) => 
  {
    renderer_appendToTerminal(data);
  });

  // Listen for messages from the main process
  window.electronAPI.receive('docker-output-error', (data) => 
  {
    renderer_appendToTerminal(data,true);
  });

  window.electronAPI.receive('container-exited', (code) => 
  {
    document.getElementById('loadingIndicator').style.display = 'none'; // Hide loading indicator
    renderer_appendToTerminal(`Container exited with code ${code}`);
  });

  // --------------------------------------------------
  // Call the checkDocker function on load
  // renderer_checkDocker();
});

