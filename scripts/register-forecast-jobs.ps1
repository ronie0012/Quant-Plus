# Registers the Forecast Card jobs as Windows scheduled tasks (weekdays, local time = IST).
# Review before running. Remove with: Unregister-ScheduledTask -TaskName "QuantPlus Forecast *" -Confirm:$false
# Cost note: "daily" locks ~100 cards for NIFTY 50 x 2 horizons (~0.5-0.7M tokens);
# "tournament" adds ~25 ranking calls. Use -Limit to cap the universe.
param(
  [string]$Backend = "D:\QP\agent-service",
  [string]$Python = "D:\Quant-Plus\.local-data\backend-runtime\Scripts\python.exe",
  [int]$Limit = 50
)
$days = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
$jobs = @(
  @{ Name = "QuantPlus Forecast Settle"; At = "16:15"; Args = "settle" },
  @{ Name = "QuantPlus Forecast Daily"; At = "16:30"; Args = "daily --limit $Limit" },
  @{ Name = "QuantPlus Forecast Tournament"; At = "17:30"; Args = "tournament --limit $Limit" }
)
foreach ($job in $jobs) {
  $action = New-ScheduledTaskAction -Execute $Python `
    -Argument "-B -m quantplus_intelligence.forecast.jobs $($job.Args)" -WorkingDirectory $Backend
  $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At $job.At
  Register-ScheduledTask -TaskName $job.Name -Action $action -Trigger $trigger -Force | Out-Null
  Write-Output "Registered $($job.Name) at $($job.At): jobs $($job.Args)"
}
