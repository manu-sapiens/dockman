document.addEventListener('DOMContentLoaded', () => {
  const terminal = document.getElementById('terminal');
  const startContainerBtn = document.getElementById('startContainer');
  const devToolsBtn = document.getElementById('devToolsButton');

  // Function to check Docker installation and update button state
  function checkDocker() {
    window.electronAPI.checkDockerInstalled((error, stdout, stderr) => {
      if (error) {
        console.error('Docker is not installed:', error);
        startContainerBtn.disabled = true;


      } else {
        console.log('Docker version:', stdout);
        startContainerBtn.disabled = false;
      }
    });
  }

  function appendToTerminal(t, text) {
    t.textContent += text;
    t.scrollTop = terminal.scrollHeight; // Scroll to the bottom
  }

  document.getElementById('openWindowButton').addEventListener('click', () => {
    window.electronAPI.openNewWindow('http://127.0.0.1:1688');});

  // Call the checkDocker function on load
  checkDocker();

  // Event listener for the start container button
  startContainerBtn.addEventListener('click', () => {
    window.electronAPI.startContainer();
  });

  // Event listener for the dev tools button
  devToolsBtn.addEventListener('click', () => {
    window.electronAPI.toggleDevTools();
  });

  // Listen for messages from the main process
  window.electronAPI.receive('docker-output', (data) => {
    appendToTerminal(terminal, data);
  });

  startContainerBtn.addEventListener('click', () => {
    document.getElementById('loadingIndicator').style.display = 'block'; // Show loading indicator
    window.electronAPI.startContainer();
  });

  window.electronAPI.receive('container-exited', (code) => {
    document.getElementById('loadingIndicator').style.display = 'none'; // Hide loading indicator
    appendToTerminal(`Container exited with code ${code}`);
  });


  

});
