use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use log::{error, info, warn};
use serde::Serialize;
use std::io::{Read, Write};
use std::time::Duration;
use tokio::time::sleep;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Parser)]
#[command(name = "pis88")]
#[command(about = "S88 CO2 Sensor Agent")]
struct Cli {
    /// Server WebSocket URL
    #[arg(long, default_value = "ws://localhost:3905/api/wss")]
    server: String,

    /// API key for authentication
    #[arg(long)]
    key: String,

    /// Serial port device
    #[arg(long, default_value = "/dev/serial0")]
    port: String,

    /// Polling interval in seconds
    #[arg(long, default_value = "10")]
    interval: u64,
}

#[derive(Debug, Serialize)]
struct AuthMessage {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(rename = "apiKey")]
    api_key: String,
}

#[derive(Debug, Serialize)]
struct DataMessage {
    #[serde(rename = "type")]
    msg_type: String,
    readings: Vec<Reading>,
}

#[derive(Debug, Serialize, Clone)]
struct Reading {
    device: String,
    channel: String,
    value: f64,
}

// Command: Read RAM 0x08
const S88_COMMAND: [u8; 7] = [0xFE, 0x44, 0x00, 0x08, 0x02, 0x9F, 0x25];

fn read_sensor(port_name: &str) -> Option<i32> {
    match serialport::new(port_name, 9600)
        .timeout(Duration::from_secs(1))
        .open()
    {
        Ok(mut port) => {
            // Flush input buffer
            let _ = port.clear(serialport::ClearBuffer::Input);

            // Send command
            if let Err(e) = port.write_all(&S88_COMMAND) {
                error!("Failed to write to serial port: {}", e);
                return None;
            }

            // Wait 0.5s for sensor processing
            std::thread::sleep(Duration::from_millis(500));

            // Read response
            let mut serial_buf: Vec<u8> = vec![0; 7];
            match port.read_exact(serial_buf.as_mut_slice()) {
                Ok(_) => {
                    if serial_buf[0] == 0xFE && serial_buf[1] == 0x44 {
                        let high = serial_buf[3] as i32;
                        let low = serial_buf[4] as i32;
                        let co2 = (high * 256) + low;
                        return Some(co2);
                    } else {
                        error!("Invalid data header: {:02X?}", serial_buf);
                    }
                }
                Err(e) => error!("Failed to read from serial port: {}", e),
            }
        }
        Err(e) => error!("Failed to open serial port {}: {}", port_name, e),
    }

    None
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    let cli = Cli::parse();

    info!("Starting PiS88 Agent...");
    info!("Server: {}", cli.server);
    info!("Serial Port: {}", cli.port);

    let mut reconnect_delay = Duration::from_secs(1);
    let max_reconnect_delay = Duration::from_secs(60);

    loop {
        // Connect to WebSocket
        info!("Connecting to {}...", cli.server);
        match connect_async(&cli.server).await {
            Ok((ws_stream, _)) => {
                info!("Connected to server");
                reconnect_delay = Duration::from_secs(1);
                let (mut write, mut read) = ws_stream.split();

                // Authenticate
                let auth = AuthMessage {
                    msg_type: "auth".to_string(),
                    api_key: cli.key.clone(),
                };
                if let Err(e) = write
                    .send(Message::Text(serde_json::to_string(&auth)?))
                    .await
                {
                    error!("Failed to send auth: {}", e);
                    continue; // Reconnect
                }
                
                 // Wait for auth response (optimistic, just start sending loop for now to match tapo structure roughly)
                 // In a robust implementation we should wait for "auth_success" but for now we follow the simple pattern

                let mut interval = tokio::time::interval(Duration::from_secs(cli.interval));

                loop {
                    tokio::select! {
                        _ = interval.tick() => {
                            if let Some(co2) = read_sensor(&cli.port) {
                                info!("CO2 Reading: {} ppm", co2);
                                
                                let readings = vec![Reading {
                                    device: "pis88".to_string(),
                                    channel: "co2".to_string(),
                                    value: co2 as f64,
                                }];

                                let data = DataMessage {
                                    msg_type: "data".to_string(),
                                    readings,
                                };

                                if let Err(e) = write.send(Message::Text(serde_json::to_string(&data)?)).await {
                                    error!("Failed to send data: {}", e);
                                    break; // Break inner loop to reconnect
                                }
                            }
                        }
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Ping(data))) => {
                                    let _ = write.send(Message::Pong(data)).await;
                                }
                                Some(Ok(Message::Close(_))) => {
                                    info!("Server closed connection");
                                    break;
                                }
                                Some(Err(e)) => {
                                    error!("WebSocket error: {}", e);
                                    break;
                                }
                                None => {
                                    info!("Connection closed");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error!("Connection failed: {}", e);
            }
        }

        warn!("Reconnecting in {:?}...", reconnect_delay);
        sleep(reconnect_delay).await;
        reconnect_delay = std::cmp::min(reconnect_delay * 2, max_reconnect_delay);
    }
}
