use clap::Parser;
use tapo::ApiClient;
use tapo::responses::CountdownRulesResult;
use tapo::{PlugEnergyMonitoringHandler, PlugHandler};
use tokio::time::{sleep, Duration};

// Enum to wrap different device handlers
enum DeviceHandler {
    P100(PlugHandler),
    P110(PlugEnergyMonitoringHandler),
}

impl DeviceHandler {
    async fn set_countdown(&self, delay: u64, turn_on: bool) -> Result<(), tapo::Error> {
        match self {
            Self::P100(h) => h.set_countdown(delay, turn_on).await,
            Self::P110(h) => h.set_countdown(delay, turn_on).await,
        }
    }

    async fn get_countdown_rules(&self) -> Result<CountdownRulesResult, tapo::Error> {
        match self {
            Self::P100(h) => h.get_countdown_rules().await,
            Self::P110(h) => h.get_countdown_rules().await,
        }
    }

    async fn on(&self) -> Result<(), tapo::Error> {
        match self {
            Self::P100(h) => h.on().await,
            Self::P110(h) => h.on().await,
        }
    }

    async fn off(&self) -> Result<(), tapo::Error> {
        match self {
            Self::P100(h) => h.off().await,
            Self::P110(h) => h.off().await,
        }
    }
}

#[derive(Parser)]
#[command(name = "tapo-countdown")]
#[command(about = "Set or cancel countdown timer on Tapo smart plug")]
struct Cli {
    /// Device IP address
    #[arg(short, long)]
    ip: String,

    /// Tapo account email
    #[arg(short, long, env = "TAPO_EMAIL")]
    email: String,

    /// Tapo account password
    #[arg(short = 'P', long, env = "TAPO_PASSWORD")]
    password: String,

    /// Device type: P100 or P110 (default: P110)
    #[arg(short = 't', long, default_value = "P110")]
    device_type: String,

    /// Delay in seconds (required unless --cancel is used)
    #[arg(short, long, required_unless_present = "cancel")]
    delay: Option<u64>,

    /// Action when countdown completes: "on" or "off"
    #[arg(short, long, default_value = "off")]
    action: String,

    /// Set immediate state after verifying countdown (safety feature)
    /// Only works if delay is set. "on" or "off"
    #[arg(short = 's', long)]
    set_state: Option<String>,

    /// Cancel any active countdown
    #[arg(short, long)]
    cancel: bool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    let cli = Cli::parse();

    println!("Connecting to {} device at {}...", cli.device_type, cli.ip);
    
    let client = ApiClient::new(&cli.email, &cli.password);
    
    // Create the appropriate handler based on device type
    let plug = match cli.device_type.to_uppercase().as_str() {
        "P100" | "P105" => DeviceHandler::P100(client.p100(&cli.ip).await?),
        "P110" | "P115" => DeviceHandler::P110(client.p110(&cli.ip).await?),
        _ => {
            eprintln!("Error: device-type must be P100 or P110 (or similar)");
            std::process::exit(1);
        }
    };

    if cli.cancel {
        println!("Canceling countdown...");
        // Set countdown to disabled by using delay 0
        plug.set_countdown(0, false).await?;
        println!("Countdown canceled!");
        return Ok(());
    }

    let delay = cli.delay.unwrap();
    let turn_on = match cli.action.to_lowercase().as_str() {
        "on" => true,
        "off" => false,
        _ => {
            eprintln!("Error: action must be 'on' or 'off'");
            std::process::exit(1);
        }
    };

    println!(
        "Setting countdown: turn {} in {} seconds",
        if turn_on { "ON" } else { "OFF" },
        delay
    );

    plug.set_countdown(delay, turn_on).await?;
    println!("Countdown set successfully!");

    // Verify countdown status
    let mut verified = false;
    // Retry a few times to ensure device has updated state
    for _ in 0..3 {
        match plug.get_countdown_rules().await {
            Ok(countdown) => {
                if let Some(rule) = countdown.rules.iter().find(|r| r.enable && r.remain > 0) {
                    let will_turn_on = rule.desired_states.as_ref().and_then(|s| s.on).unwrap_or(false);
                    println!(
                        "Active countdown verified: {} seconds remaining, will turn {}",
                        rule.remain,
                        if will_turn_on { "ON" } else { "OFF" }
                    );
                    
                    // Verify that the set rule matches our intention
                    if will_turn_on == turn_on {
                        verified = true;
                        break;
                    } else {
                        eprintln!("Warning: Active countdown action doesn't match requested action!");
                    }
                }
            }
            Err(e) => {
                eprintln!("Warning: Could not verify countdown: {}", e);
            }
        }
        sleep(Duration::from_millis(500)).await;
    }

    if verified {
        if let Some(target_state) = cli.set_state {
            let set_on = match target_state.to_lowercase().as_str() {
                "on" => true,
                "off" => false,
                _ => {
                    eprintln!("Error: set-state must be 'on' or 'off'");
                    std::process::exit(1);
                }
            };
            
            println!("Safely setting device state to {}...", if set_on { "ON" } else { "OFF" });
            if set_on {
                plug.on().await?;
            } else {
                plug.off().await?;
            }
            println!("Device state updated.");
        }
    } else {
        eprintln!("Verification FAILED or timed out. NOT changing device state for safety.");
        if cli.set_state.is_some() {
             std::process::exit(1);
        }
    }

    Ok(())
}
