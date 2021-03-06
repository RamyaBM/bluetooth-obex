/// <reference path="chrome.d.ts"/>
/// <reference path="core.ts"/>
/// <reference path="obex.ts"/>
/// <reference path="bluetooth.ts"/>

module SendFile {
  // See https://www.bluetooth.org/en-us/specification/assigned-numbers/service-discovery
  var kOBEXObjectPush = '00001105-0000-1000-8000-00805f9b34fb';

  function log(msg) {
    var msg_str = (typeof (msg) == 'object') ? JSON.stringify(msg) : msg;
    console.log(msg_str);

    var ul = document.getElementById('messages-ul');
    if (ul) {
      var li = document.createElement("li");
      li.className = "message";

      var div = document.createElement("div");
      div.className = "content";

      var span = document.createElement("span");
      span.innerText = msg;

      ul.appendChild(li);
      li.appendChild(div);
      div.appendChild(span);
    }
  }

  function clearChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function createActionButton(label, caption, callback) {
    var button = document.createElement("input");
    button.setAttribute("type", "button");
    button.setAttribute("value", caption);
    button.onclick = callback;

    var labelElement = document.createElement("label");
    labelElement.textContent = label;
    labelElement.appendChild(button);
    return labelElement;
  }

  function registerObexPushProfile(callback: (profile: string) => void) {
    var uuid = kOBEXObjectPush.toLowerCase();
    var profile = { uuid: uuid };
    callback(uuid);
    //chrome.bluetooth.addProfile(profile, () => {
    //  if (chrome.runtime.lastError) {
    //    log("Error adding \"Obex Push\" profile: " + chrome.runtime.lastError.message + " (continue anyways).");
    //  }

    //  callback(profile);
    //  return;
    //});
  }

  function sendFileToSocket(socketId: number, name: string, contents: ArrayBuffer, callback: () => void) {
    var requestProcessor = new Bluetooth.RequestProcessor(socketId);
    var processor = new Bluetooth.SendFileProcessor(requestProcessor, name, contents);
    processor.setErrorHandler((message: string) => {
      log("Error sending file: " + message);
      callback();
      return;
    });
    var sendFileCallback = (finished: boolean) => {
      log("Packet at offset " + processor.fileOffset + " of " + processor.fileLength + " sent to peer device.");
      if (finished) {
        log("File \"" + name + "\" successfully sent.");
        callback();
      }
      else {
        processor.sendNextRequest(sendFileCallback);
      }
    };
    processor.sendNextRequest(sendFileCallback);
  }

  function sendFileToDevice(device: Bluetooth.Device, fileName: string, contents: ArrayBuffer) {
    log("Sending file \"" + fileName + "\" of length " + contents.byteLength + ".");

    registerObexPushProfile(profile_uuid => {
      chrome.bluetoothSocket.create({}, (createInfo) => {
        if (chrome.runtime.lastError) {
          log("Error creating bluetooth socket: " + chrome.runtime.lastError.message);
          return;
        }
        chrome.bluetoothSocket.connect(createInfo.socketId, device.address, profile_uuid, () => {
          if (chrome.runtime.lastError) {
            log("Error connecting to Object Push profile: " + chrome.runtime.lastError.message);
            return;
          }
          sendFileToSocket(createInfo.socketId, fileName, contents, () => {
            chrome.bluetoothSocket.disconnect(createInfo.socketId, () => {
                log("Socket closed.");
              });
            });
        });
      });
    });
  }

  function sendFileAction(device: Bluetooth.Device) {
    chrome.fileSystem.chooseEntry({ type: 'openFile' }, function (readOnlyEntry) {
      readOnlyEntry.file(function (file: any) {
        var reader = new FileReader();
        reader.onerror = e => {
          log("Error loading file: " + e.message);
        };
        reader.onloadend = e => {
          log("File loaded successfully!");
          sendFileToDevice(device, file.name, reader.result);
        };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  function displayDevices() {
    log('Getting list of devices...')
    var table = document.getElementById("device-list");
    clearChildren(table);
    chrome.bluetooth.getDevices(devices => {
      devices.forEach(device => {
        var row = document.createElement("tr");
        table.appendChild(row);

        var td = document.createElement("td");
        td.innerText = device.address;
        row.appendChild(td);

        var td = document.createElement("td");
        td.innerText = device.name;
        row.appendChild(td);

        var td = document.createElement("td");
        td.innerText = device.paired.toString();
        row.appendChild(td);

        var td = document.createElement("td");
        td.innerText = device.connected.toString();
        row.appendChild(td);

        // Actions
        var td = document.createElement("td");
        row.appendChild(td);
        var objectPushAction = createActionButton("", "Send File...", function () {
          sendFileAction(device);
        });
        td.appendChild(objectPushAction);
      });
      
      log('Done getting devices.')
    });
  }

  function Setup() {
    var button = document.getElementById("device-details");
    button.onclick = (ev) => {
      (<any>chrome).app.window.create('../index.html', {
        id: "device-details-window",
        bounds: {
          width: 640,
          height: 480
        }
      });
    }
    displayDevices();
    chrome.bluetooth.onDeviceAdded.addListener(device => {
      log("Device added: " + device.address + ", name=" + device.name);
    });
    chrome.bluetooth.onDeviceRemoved.addListener(device => {
      log("Device removed: " + device.address + ", name=" + device.name);
    });
    chrome.bluetooth.onDeviceChanged.addListener(device => {
      log("Device changed: " + device.address + ", name=" + device.name);
    });
  }

  window.onload = function () {
    Setup();
  }
}
