const productWindowUrl = 'http://127.0.0.1:1688';

// --------------------------------------------------
document.addEventListener('DOMContentLoaded', () => 
{
  const terminal = document.getElementById('terminal');
  const startContainerBtn = document.getElementById('startContainer');
  const devToolsBtn = document.getElementById('devToolsButton');
  const openProductBtn = document.getElementById('openProductButton');
  const loadingUi = document.getElementById('loadingIndicator');
  const dockerStatus = document.getElementById('dockerStatus');
  const containerStatus = document.getElementById('containerStatus');

  // --------------------------------------------------
  // Function to check Docker installation and update button state
  async function renderer_checkDocker() 
  {
    const installed = await window.electronAPI.electron_checkDockerInstalled();
    //startContainerBtn.disabled = !installed;
  }

  function renderer_appendToTerminal(t, text) 
  {
    t.textContent += text;
    t.scrollTop = terminal.scrollHeight; // Scroll to the bottom
  }

  // Listen for Docker status updates from the main process
  window.electronAPI.receive('docker-status-update', (message) => 
  {
    console.log(`[renderer.js] docker-status-update message = ${message}`);
    
    // Update your UI based on the message
    dockerStatus.innerText = message;
  });


  // Listen for Container status updates from the main process
  window.electronAPI.receive('container-status-update', (message) => 
  {
    console.log(`[renderer.js] container-status-update message = ${message}`);
   
    // Update your UI based on the message
    containerStatus.innerText = message;
  });


  // --------------------------------------------------
  openProductBtn.addEventListener('click', () => 
  {
    window.electronAPI.electron_openProductWindow(productWindowUrl);
  });

  // Event listener for the start container button
  startContainerBtn.addEventListener('click', () => 
  {
    loadingUi.style.display = 'block'; // Show loading indicator
    window.electronAPI.electron_startContainer();
  });

  // Event listener for the dev tools button
  devToolsBtn.addEventListener('click', () => 
  {
    window.electronAPI.electron_toggleDevTools();
  });

  // Listen for messages from the main process
  window.electronAPI.receive('docker-output', (data) => 
  {
    renderer_appendToTerminal(terminal, data);
  });

  window.electronAPI.receive('container-exited', (code) => 
  {
    document.getElementById('loadingIndicator').style.display = 'none'; // Hide loading indicator
    renderer_appendToTerminal(`Container exited with code ${code}`);
  });

  // --------------------------------------------------
  // Call the checkDocker function on load
  renderer_checkDocker();
});

