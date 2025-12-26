import React, { Component } from 'react';
import { Box, Paper, Typography, CircularProgress, IconButton } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { useDrawingArea, useYScale, useXScale } from '@mui/x-charts/hooks';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

// Custom component to render a horizontal band between two y-values
function ReferenceArea({ yMin, yMax, color = 'rgba(76, 175, 80, 0.15)', axisId = 'left' }) {
    const { left, width } = useDrawingArea();
    const yScale = useYScale(axisId);

    if (!yScale) return null;

    const y1 = yScale(yMax);
    const y2 = yScale(yMin);

    if (y1 === undefined || y2 === undefined) return null;

    return (
        <rect
            x={left}
            y={Math.min(y1, y2)}
            width={width}
            height={Math.abs(y2 - y1)}
            fill={color}
        />
    );
}

// Custom component to render vertical time bands every 6 hours aligned to midnight
function TimeReferenceAreas({ axisStart, axisEnd, colors }) {
    const { top, height } = useDrawingArea();
    const xScale = useXScale();

    if (!xScale) return null;

    // Calculate 6-hour bands aligned to midnight
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const bands = [];

    // Find the first midnight before axisStart
    const startDate = new Date(axisStart);
    const midnight = new Date(startDate);
    midnight.setHours(0, 0, 0, 0);

    // Start from that midnight
    let bandStart = midnight.getTime();

    while (bandStart < axisEnd) {
        const bandEnd = bandStart + SIX_HOURS;

        // Only render if band overlaps with visible range
        if (bandEnd > axisStart && bandStart < axisEnd) {
            const visibleStart = Math.max(bandStart, axisStart);
            const visibleEnd = Math.min(bandEnd, axisEnd);

            const x1 = xScale(new Date(visibleStart));
            const x2 = xScale(new Date(visibleEnd));

            if (x1 !== undefined && x2 !== undefined) {
                // Determine which 6-hour block (0-3) based on hour of day
                const hour = new Date(bandStart).getHours();
                const blockIndex = Math.floor(hour / 6); // 0, 1, 2, or 3
                const color = colors[blockIndex % colors.length];

                bands.push(
                    <rect
                        key={bandStart}
                        x={Math.min(x1, x2)}
                        y={top}
                        width={Math.abs(x2 - x1)}
                        height={height}
                        fill={color}
                    />
                );
            }
        }
        bandStart = bandEnd;
    }

    return <>{bands}</>;
}

// Helper function to calculate Simple Moving Average
function calculateSMA(data, channelKey, period) {
    if (period <= 1 || data.length === 0) return data;

    return data.map((row, i) => {
        const newRow = { ...row };
        const values = [];

        // Look back up to 'period' samples
        for (let j = Math.max(0, i - period + 1); j <= i; j++) {
            const val = data[j][channelKey];
            if (val !== null && val !== undefined && !isNaN(val)) {
                values.push(val);
            }
        }

        // Calculate average if we have values
        if (values.length > 0) {
            newRow[channelKey] = values.reduce((a, b) => a + b, 0) / values.length;
        }

        return newRow;
    });
}

export default class Chart extends Component {
    constructor(props) {
        super(props);
        this.state = {
            data: [],
            loading: true,
            hiddenSeries: {}, // { seriesId: true/false }
            lastValues: {}, // { channelId: lastValue } - for detecting changes
            flashStates: {} // { channelId: 'up' | 'down' | null } - for flash animation
        };
        this.interval = null;
        this.flashTimeouts = {}; // Store timeouts to clear flash states
    }

    componentDidMount() {
        this.fetchData();
        // Set interval if in Live mode (no windowEnd prop or windowEnd is null)
        if (!this.props.windowEnd) {
            this.interval = setInterval(this.fetchData, 60000);
        }
    }

    componentDidUpdate(prevProps) {
        const prevEffective = this.getEffectiveChannels(prevProps);
        const currEffective = this.getEffectiveChannels(this.props);

        const propsChanged = prevEffective.join(',') !== currEffective.join(',') ||
            JSON.stringify(prevProps.channelConfig) !== JSON.stringify(this.props.channelConfig) ||
            JSON.stringify(prevProps.axisConfig) !== JSON.stringify(this.props.axisConfig) ||
            prevProps.windowEnd !== this.props.windowEnd ||
            prevProps.range !== this.props.range;

        if (propsChanged) {
            this.fetchData();
        }

        // Manage interval based on windowEnd prop
        if (prevProps.windowEnd !== this.props.windowEnd) {
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
            if (!this.props.windowEnd) {
                this.interval = setInterval(this.fetchData, 60000);
            }
        }
    }

    componentWillUnmount() {
        if (this.interval) {
            clearInterval(this.interval);
        }
        // Clear any pending flash timeouts
        Object.values(this.flashTimeouts).forEach(timeout => clearTimeout(timeout));
    }

    getEffectiveChannels(props) {
        if (props.channelConfig) {
            return props.channelConfig.map(c => c.id);
        }
        return props.selectedChannels || [];
    }

    fetchData = () => {
        const { windowEnd, range } = this.props;
        const effectiveChannels = this.getEffectiveChannels(this.props);

        // Only fetch if selection exists
        if (effectiveChannels.length === 0) {
            this.setState({ data: [], loading: false });
            return;
        }

        const selectionStr = effectiveChannels.join(',');

        // Time Window Logic
        const rangeMs = range || 24 * 60 * 60 * 1000;

        const endTimeVal = windowEnd ? windowEnd.getTime() : Date.now();
        const startWindowTime = endTimeVal - rangeMs;

        const since = new Date(startWindowTime).toISOString();
        const until = new Date(endTimeVal).toISOString();

        fetch(`/api/readings?selection=${encodeURIComponent(selectionStr)}&since=${since}&until=${until}`)
            .then(res => res.json())
            .then(dataObj => {
                // Safety check: ensure dataObj is a valid object
                if (!dataObj || typeof dataObj !== 'object') {
                    console.error('Invalid data received from API:', dataObj);
                    this.setState({ data: [], loading: false });
                    return;
                }

                // Recalculate effective channels inside callback (closure fix)
                const channelList = this.getEffectiveChannels(this.props);

                // 1. Parse raw rows into intervals per channel
                const intervals = [];
                const timestampsSet = new Set();

                // dataObj format: { "device:channel": [ [timestamp, value, until], ... ] }
                Object.entries(dataObj).forEach(([id, points]) => {
                    // Check if this ID is in our effective/requested list
                    if (!channelList || !channelList.includes(id)) return;

                    // Skip if points is not a valid array
                    if (!Array.isArray(points)) return;

                    // Ensure sorted by time
                    points.sort((a, b) => new Date(a[0]) - new Date(b[0]));

                    for (let i = 0; i < points.length; i++) {
                        const [tsStr, rawVal, untilStr] = points[i];
                        const numVal = Number(rawVal);
                        // MUI-X charts only accepts numbers and null - NaN causes errors
                        const val = Number.isNaN(numVal) ? null : numVal;

                        let start = new Date(tsStr).getTime();
                        let explicitEnd = untilStr ? new Date(untilStr).getTime() : null;

                        // Determine start of next point to prevent overlap
                        let nextStart = null;
                        if (i < points.length - 1) {
                            nextStart = new Date(points[i + 1][0]).getTime();
                        }

                        // Calculate effective end
                        let end = explicitEnd;
                        // If 'until' is null, extend to next point or now (but never beyond current time)
                        const nowTime = Date.now();
                        if (!end) {
                            end = nextStart || Math.min(endTimeVal, nowTime);
                        }
                        // Never extend data beyond the current time
                        if (end > nowTime) {
                            end = nowTime;
                        }

                        // Strict Cutoff: Current interval cannot extend past the start of the next interval
                        // This fixes the "vertical artifacting" where old data persists underneath new data
                        if (nextStart && end > nextStart) {
                            end = nextStart;
                        }

                        // Clamping logic
                        if (start < startWindowTime) start = startWindowTime;
                        if (end > endTimeVal) end = endTimeVal;

                        // If valid interval
                        if (end >= start) {
                            intervals.push({ id, start, end, val });
                            timestampsSet.add(start);
                            timestampsSet.add(end);
                        }
                    }
                });

                // 2. Sort unique timestamps
                const sortedTimestamps = Array.from(timestampsSet).sort((a, b) => a - b);

                // 3. densify data
                const denseData = sortedTimestamps.map(t => {
                    const row = { time: new Date(t) };
                    intervals.forEach(inv => {
                        // Inclusive of start, exclusive of end? 
                        // Actually, dense data points are discrete samples.
                        // We check: start <= t <= end.
                        // However, if we have contiguous intervals [A, B] and [B, C],
                        // Point B belongs to the *second* interval usually (new value starts).
                        // With our cutoff logic, first interval ends at B, second starts at B.
                        // If we use <= end, both match at B. Last writer wins?
                        // Intervals are pushed in channel order.
                        // For same channel, intervals are sorted.
                        // `intervals.forEach(inv)` -> if multiple match, the *last* one in the array (later time) overwrites.
                        // So correct: t=B matches [A, B] and [B, C]. [B, C] comes later in `intervals` (if we sorted intervals total? No we didn't).
                        // We only sorted points within channel loop. `intervals` array order is: channel A points, channel B points...
                        // So overlapping intervals for SAME channel:
                        // [A, B] pushed first. [B, C] pushed second.
                        // At t=B, both match. [B, C] overwrites. Correct (new value wins).

                        if (t >= inv.start && t <= inv.end) {
                            row[inv.id] = inv.val;
                        }
                    });
                    // Ensure all channel values are numbers or null (MUI-X requirement)
                    channelList.forEach(ch => {
                        if (row[ch] !== null && (typeof row[ch] !== 'number' || !Number.isFinite(row[ch]))) {
                            row[ch] = null;
                        }
                    });
                    return row;
                });

                // 4. Apply SMA for channels that have it configured
                const { channelConfig } = this.props;
                let processedData = denseData;

                if (channelConfig) {
                    channelConfig.forEach(cfg => {
                        if (cfg.sma && cfg.sma > 1) {
                            processedData = calculateSMA(processedData, cfg.id, cfg.sma);
                        }
                    });
                }

                // 5. Detect value changes for flash animation
                const effectiveChannels = this.getEffectiveChannels(this.props);
                const newLastValues = {};
                const newFlashStates = { ...this.state.flashStates };

                // Get latest value for each channel (search from end of data)
                if (processedData.length > 0) {
                    effectiveChannels.forEach(channelId => {
                        // Find most recent non-null value for this channel
                        let newVal = null;
                        for (let i = processedData.length - 1; i >= 0 && newVal === null; i--) {
                            const val = processedData[i][channelId];
                            if (val !== null && val !== undefined) {
                                newVal = val;
                            }
                        }

                        if (newVal !== null) {
                            newLastValues[channelId] = newVal;
                            const oldVal = this.state.lastValues[channelId];

                            // Only flash if we had a previous value and it changed
                            if (oldVal !== undefined && oldVal !== newVal) {
                                const direction = newVal > oldVal ? 'up' : 'down';
                                newFlashStates[channelId] = direction;
                                console.log(`[Flash] ${channelId}: ${oldVal} → ${newVal} (${direction})`);

                                // Clear flash after 1 second
                                if (this.flashTimeouts[channelId]) {
                                    clearTimeout(this.flashTimeouts[channelId]);
                                }
                                this.flashTimeouts[channelId] = setTimeout(() => {
                                    this.setState(prev => ({
                                        flashStates: { ...prev.flashStates, [channelId]: null }
                                    }));
                                }, 1000);
                            }
                        }
                    });
                }

                this.setState({
                    data: processedData,
                    loading: false,
                    lastValues: newLastValues,
                    flashStates: newFlashStates
                });
            })
            .catch(err => {
                console.error(err);
                this.setState({ loading: false });
            });
    };

    computeAxisLimits(axisKey, effectiveChannels, series) {
        // Collect all data points for this axis
        let axisMin = Infinity;
        let axisMax = -Infinity;

        const axisSeries = series.filter(s => s.yAxisId === axisKey).map(s => s.dataKey);

        if (axisSeries.length === 0) return {}; // No data for this axis

        // Check if config exists for this axis
        const { axisConfig } = this.props;
        let cfgMin = parseFloat(NaN);
        let cfgMax = parseFloat(NaN);
        if (axisConfig && axisConfig[axisKey]) {
            cfgMin = parseFloat(axisConfig[axisKey].min);
            cfgMax = parseFloat(axisConfig[axisKey].max);
        }

        // Optimization: If no config set, just return empty and let chart autoscale fully.
        if (isNaN(cfgMin) && isNaN(cfgMax)) return {};

        // Calculate data bounds
        let hasData = false;
        this.state.data.forEach(row => {
            axisSeries.forEach(key => {
                const val = row[key];
                if (val !== null && val !== undefined) {
                    hasData = true;
                    if (val < axisMin) axisMin = val;
                    if (val > axisMax) axisMax = val;
                }
            });
        });

        if (!hasData) return {}; // No valid data points

        // Apply config soft limits
        if (!isNaN(cfgMin)) axisMin = Math.min(axisMin, cfgMin);
        if (!isNaN(cfgMax)) axisMax = Math.max(axisMax, cfgMax);

        return { min: axisMin, max: axisMax };
    }

    toggleSeries = (seriesId) => {
        this.setState(prev => ({
            hiddenSeries: {
                ...prev.hiddenSeries,
                [seriesId]: !prev.hiddenSeries[seriesId]
            }
        }));
    };

    render() {
        const { loading, data, hiddenSeries, flashStates } = this.state;
        const { channelConfig, windowEnd, range } = this.props;
        const effectiveChannels = this.getEffectiveChannels(this.props);

        if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
        if (effectiveChannels.length === 0) return <Box sx={{ p: 4 }}><Typography>No channels selected.</Typography></Box>;

        // Build legend config (all channels, for rendering custom legend)
        const legendItems = effectiveChannels.map(id => {
            let label = id;
            let color = '#888';
            if (channelConfig) {
                const item = channelConfig.find(c => c.id === id);
                if (item) {
                    if (item.alias) label = item.alias;
                    if (item.color) color = item.color;
                }
            }
            return { id, label, color, hidden: !!hiddenSeries[id] };
        });

        // Filter out hidden series
        const visibleChannels = effectiveChannels.filter(id => !hiddenSeries[id]);

        const series = visibleChannels.map(id => {
            // Find alias and axis if config exists
            let label = id;
            let yAxisKey = 'left';
            let color = undefined;
            let fillColor = undefined;
            let fillOpacity = 0.5;
            if (channelConfig) {
                const item = channelConfig.find(c => c.id === id);
                if (item) {
                    if (item.alias) label = item.alias;
                    if (item.yAxis) yAxisKey = item.yAxis;
                    if (item.color) color = item.color;
                    if (item.fillColor) fillColor = item.fillColor;
                    if (item.fillOpacity !== undefined) fillOpacity = item.fillOpacity;
                }
            }

            const sObj = {
                dataKey: id,
                label: label,
                connectNulls: true,
                showMark: false,
                yAxisId: yAxisKey,
            };
            if (color) sObj.color = color;
            // Enable area fill if fillColor is set (with configurable opacity)
            if (fillColor) {
                sObj.area = true;
                sObj.fillOpacity = fillOpacity;
            }
            return sObj;
        });

        const hasRightAxis = series.some(s => s.yAxisId === 'right');

        const leftLimits = this.computeAxisLimits('left', effectiveChannels, series);
        const rightLimits = this.computeAxisLimits('right', effectiveChannels, series);

        const yAxes = [
            { id: 'left', ...leftLimits }
        ];
        if (hasRightAxis) {
            yAxes.push({ id: 'right', position: 'right', ...rightLimits });
        }

        // Calculate X-Axis Limits
        const rangeMs = range || 24 * 60 * 60 * 1000;
        const axisEnd = windowEnd ? windowEnd.getTime() : Date.now();
        const axisStart = axisEnd - rangeMs;

        // Determine if all visible series are Temperature channels
        const isTemperatureOnly = visibleChannels.length > 0 && visibleChannels.every(id => {
            const lcId = id.toLowerCase();
            return lcId.includes('temp') || lcId.includes('temperature');
        });

        // Determine if all visible series are Humidity channels
        const isHumidityOnly = visibleChannels.length > 0 && visibleChannels.every(id => {
            const lcId = id.toLowerCase();
            return lcId.includes('humid') || lcId.includes('humidity') || lcId.includes('rh');
        });

        // Determine if all visible series are Light channels
        const isLightOnly = visibleChannels.length > 0 && visibleChannels.every(id => {
            const lcId = id.toLowerCase();
            return lcId.includes('light');
        });

        // Colors for 6-hour time bands (midnight, 6am, noon, 6pm)
        const lightBandColors = [
            'rgba(0, 0, 0, 0.1)',        // 00:00-06:00 - black (night)
            'rgba(135, 206, 250, 0.1)',  // 06:00-12:00 - light blue (morning)
            'rgba(255, 255, 180, 0.1)',  // 12:00-18:00 - light yellow (afternoon)
            'rgba(255, 200, 150, 0.1)',  // 18:00-24:00 - light orange (evening)
        ];

        return (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', p: 2, boxSizing: 'border-box' }}>
                <Paper sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    {/* Custom Interactive Legend */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center', mb: 1, py: 0.5 }}>
                        {legendItems.map(item => {
                            const flash = flashStates[item.id];
                            const flashColor = flash === 'up' ? 'rgba(76, 175, 80, 0.4)' : flash === 'down' ? 'rgba(244, 67, 54, 0.4)' : 'transparent';
                            return (
                                <Box
                                    key={item.id}
                                    onClick={() => this.toggleSeries(item.id)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        cursor: 'pointer',
                                        opacity: item.hidden ? 0.4 : 1,
                                        textDecoration: item.hidden ? 'line-through' : 'none',
                                        transition: 'opacity 0.2s, background-color 0.3s',
                                        userSelect: 'none',
                                        backgroundColor: flashColor,
                                        borderRadius: 1,
                                        px: 0.5,
                                        '&:hover': { opacity: item.hidden ? 0.6 : 0.8 },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: 14,
                                            height: 14,
                                            borderRadius: '50%',
                                            bgcolor: item.color,
                                            border: '2px solid',
                                            borderColor: item.hidden ? 'grey.500' : item.color,
                                        }}
                                    />
                                    <Typography variant="body2" component="span">
                                        {item.label}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>
                    <Box sx={{ flexGrow: 1, width: '100%', height: '100%' }}>
                        <LineChart
                            dataset={data}
                            series={series}
                            xAxis={[{
                                dataKey: 'time',
                                scaleType: 'time',
                                min: new Date(axisStart),
                                max: new Date(axisEnd),
                                valueFormatter: (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            }]}
                            yAxis={yAxes}

                            hideLegend
                            slotProps={{
                            }}
                            sx={{
                                '& .MuiLineElement-root': {
                                    strokeWidth: 3,
                                },
                                '& .MuiAreaElement-root': {
                                    fillOpacity: series.find(s => s.area)?.fillOpacity ?? 0.5,
                                },
                            }}
                        >
                            {/* Green reference band for temperature charts (20-25°C) */}
                            {isTemperatureOnly && (
                                <ReferenceArea yMin={20} yMax={25} color="rgba(76, 175, 80, 0.2)" />
                            )}
                            {/* Green reference band for humidity charts (50-70%) */}
                            {isHumidityOnly && (
                                <ReferenceArea yMin={50} yMax={70} color="rgba(76, 175, 80, 0.2)" />
                            )}
                            {/* Time-based vertical bands for light charts (6-hour intervals) */}
                            {isLightOnly && (
                                <TimeReferenceAreas axisStart={axisStart} axisEnd={axisEnd} colors={lightBandColors} />
                            )}
                        </LineChart>
                    </Box>
                </Paper>
            </Box>
        );
    }
}
