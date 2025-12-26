import React, { Component } from 'react';
import {
    Container, Typography, Paper, List, ListItem, ListItemText, ListItemIcon,
    Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
    FormControl, InputLabel, Select, MenuItem, Box, Chip, IconButton,
    ToggleButton, ToggleButtonGroup, Slider, Snackbar, Alert, Switch, FormControlLabel
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { withRouter } from './withRouter';
import { Link as MuiLink } from '@mui/material';
import Chart from './Chart';

const RANGES = {
    '3h': 3 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1m': 30 * 24 * 60 * 60 * 1000,
    '3m': 90 * 24 * 60 * 60 * 1000,
};

const SMA_OPTIONS = [
    { value: 0, label: 'Off' },
    { value: 3, label: '3' },
    { value: 5, label: '5' },
    { value: 10, label: '10' },
    { value: 15, label: '15' },
];

const GRUVBOX_COLORS = [
    '#cc241d', '#fb4934', // Red
    '#98971a', '#b8bb26', // Green
    '#d79921', '#fabd2f', // Yellow
    '#458588', '#83a598', // Blue
    '#b16286', '#d3869b', // Purple
    '#689d6a', '#8ec07c', // Aqua
    '#d65d0e', '#fe8019', // Orange
    '#928374', '#a89984', // Gray
    '#282828', '#ebdbb2', // Bg/Fg (maybe skip dark bg)
    '#1d2021', '#fbf1c7'  // Hard dark/light
];

class ViewManager extends Component {
    constructor(props) {
        super(props);
        this.state = {
            views: [],
            rules: [],

            activeRuleIds: [],
            ruleStatuses: {},
            outputValues: {},
            outputConfigs: [],
            open: false,
            colorPickerOpen: false,
            colorPickerMode: 'line',
            editingId: null,
            viewName: '',
            availableDevices: [],

            // Editor State (Flat)
            viewConfig: [], // [{ device, channel, alias, yAxis, color }]
            axisConfig: { left: { min: '', max: '' }, right: { min: '', max: '' } },

            // Edit Helpers
            paramSelDevice: '',
            paramSelChannel: '',
            paramAlias: '',
            paramYAxis: 'left',

            pickerTargetIndex: null,

            // Global Time State
            rangeLabel: '1d',
            windowEnd: null, // null = Live

            // Notifications
            snackbarOpen: false,
            snackbarMessage: '',
            snackbarSeverity: 'info',
            statusLoaded: false
        };
    }

    componentDidMount() {
        this.refreshViews();
        this.loadRules();
        this.loadOutputValues();
        this.loadRuleStatus(); // Load immediately on mount
        // Refresh rules and outputs every 30s
        this.rulesInterval = setInterval(() => {
            this.loadRules();
            this.loadOutputValues();
            this.loadRuleStatus();
        }, 5000);
        if (this.isAdmin()) {
            this.loadOutputConfigs();
            fetch('/api/devices')
                .then(res => res.json())
                .then(devices => this.setState({ availableDevices: devices }))
                .catch(console.error);
        }
    }

    componentWillUnmount() {
        if (this.rulesInterval) clearInterval(this.rulesInterval);
    }

    componentDidUpdate(prevProps) {
        if (prevProps.user !== this.props.user) {
            this.refreshViews();
            if (this.isAdmin()) {
                this.loadOutputConfigs();
                fetch('/api/devices')
                    .then(res => res.json())
                    .then(devices => this.setState({ availableDevices: devices }))
                    .catch(console.error);
            }
        }
    }

    isAdmin() {
        const { user } = this.props;
        return user && user.role === 'admin';
    }

    refreshViews = () => {
        fetch('/api/views')
            .then(res => res.json())
            .then(views => this.setState({ views }))
            .catch(console.error);
    };

    loadRules = () => {
        fetch('/api/rules')
            .then(res => res.json())
            .then(rules => this.setState({ rules }))
            .catch(console.error);
    };

    loadOutputValues = () => {
        fetch('/api/outputs/values')
            .then(res => res.json())
            .then(outputValues => this.setState({ outputValues }))
            .catch(console.error);
    };

    loadRuleStatus = () => {
        fetch('/api/rules/status')
            .then(res => res.json())
            .then(data => {
                const newActiveIds = data.activeIds || [];
                const newStatuses = data.statuses || {};
                const prevActiveIds = this.state.activeRuleIds;

                // Use a Set for faster lookup
                const newSet = new Set(newActiveIds);
                const prevSet = new Set(prevActiveIds);

                // Find changes
                const newlyActive = newActiveIds.filter(id => !prevSet.has(id));
                const newlyInactive = prevActiveIds.filter(id => !newSet.has(id));

                if ((newlyActive.length > 0 || newlyInactive.length > 0) && this.state.statusLoaded) {
                    const { rules } = this.state;
                    const messages = [];

                    newlyActive.forEach(id => {
                        const r = rules.find(rule => rule.id === id);
                        if (r) messages.push(`${r.name || 'Rule'} Active`);
                    });

                    newlyInactive.forEach(id => {
                        const r = rules.find(rule => rule.id === id);
                        if (r) messages.push(`${r.name || 'Rule'} Inactive`);
                    });

                    if (messages.length > 0) {
                        this.showSnackbar(messages.join(', '), 'info');
                    }
                }

                this.setState({
                    activeRuleIds: newActiveIds,
                    ruleStatuses: newStatuses,
                    statusLoaded: true
                });
            })
            .catch(console.error);
    };

    showSnackbar = (message, severity = 'info') => {
        this.setState({
            snackbarOpen: true,
            snackbarMessage: message,
            snackbarSeverity: severity
        });
    };

    handleCloseSnackbar = (event, reason) => {
        if (reason === 'clickaway') {
            return;
        }
        this.setState({ snackbarOpen: false });
    };

    loadOutputConfigs = () => {
        fetch('/api/output-configs') // Assuming this endpoint exists from OutputConfigEditor usage
            .then(res => res.json())
            .then(configs => this.setState({ outputConfigs: configs }))
            .catch(console.error); // Non-critical if fails
    };

    handleOutputChange = (channel, value) => {
        const { user } = this.props;
        // Optimistic update
        this.setState(prev => ({
            outputValues: {
                ...prev.outputValues,
                [channel]: value
            }
        }));

        fetch(`/api/outputs/${channel}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ value })
        })
            .then(res => {
                if (!res.ok) throw new Error('Failed to set output');
                // Refresh to confirm
                this.loadOutputValues();
            })
            .catch(err => {
                console.error(err);
                this.showSnackbar(`Failed to set ${channel}: ${err.message}`, 'error');
                this.loadOutputValues(); // Revert on error
            });
    };

    parseViewData(view) {
        let channels = [];
        let axes = { left: { min: '', max: '' }, right: { min: '', max: '' } };

        const config = view.config;
        if (!config) return { channels, axes };

        if (Array.isArray(config)) {
            channels = config;
        } else if (config.groups) {
            config.groups.forEach(g => {
                if (g.channels) channels = [...channels, ...g.channels];
                if (g.axes) {
                    if (g.axes.left) axes.left = { ...axes.left, ...g.axes.left };
                    if (g.axes.right) axes.right = { ...axes.right, ...g.axes.right };
                }
            });
        } else if (config.channels) {
            channels = config.channels;
            if (config.axes) axes = config.axes;
        }

        channels = channels.map((c, i) => ({
            ...c,
            color: c.color || this.getNextColor(i)
        }));

        return { channels, axes };
    }

    // Emoji for rule based on action channel
    getRuleEmoji = (rule) => {
        return '⚡';
    };

    // Format conditions for display - returns React components with visual grouping
    // statusObj is the detailed execution status for this condition from the API
    formatRuleConditions = (condition, depth = 0, statusObj = null) => {
        if (!condition) return <span style={{ color: '#888' }}>(always)</span>;

        // Determine if this specific part is met based on statusObj
        const isMet = statusObj && statusObj.__result === true;
        // Determine if we should highlight this node (met or partially met)
        // For groups, we might want to color the border or background differently if satisfied

        // Base style for met conditions
        const metStyle = isMet ? {
            border: '1px solid #4caf50',
            bgcolor: 'rgba(76, 175, 80, 0.2)',
            color: '#fff'
        } : {};

        if (condition.operator === 'AND' || condition.operator === 'OR') {
            // Mapping sub-conditions to their status from the statusObj.conditions array
            const subStatuses = statusObj && statusObj.conditions ? statusObj.conditions : [];

            const parts = (condition.conditions || []).map((c, i) =>
                this.formatRuleConditions(c, depth + 1, subStatuses[i])
            ).filter(Boolean);

            if (parts.length === 0) return <span style={{ color: '#888' }}>(always)</span>;

            const isAnd = condition.operator === 'AND';
            // If the group logic itself is satisfied, use green, else use the logical color
            const borderColor = isMet ? '#4caf50' : (isAnd ? 'rgba(100, 150, 255, 0.5)' : 'rgba(255, 150, 100, 0.5)');
            const bgColor = isMet ? 'rgba(76, 175, 80, 0.1)' : (isAnd ? 'rgba(100, 150, 255, 0.08)' : 'rgba(255, 150, 100, 0.08)');
            const label = isAnd ? 'ALL' : 'ANY';
            const symbol = isAnd ? 'and' : 'or';

            return (
                <Box
                    component="span"
                    sx={{
                        display: 'inline-flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 0.5,
                        border: `1px solid ${borderColor}`,
                        borderRadius: 1,
                        bgcolor: bgColor,
                        px: 0.75,
                        py: 0.25,
                        fontSize: depth > 0 ? '0.9em' : '1em',
                        transition: 'all 0.3s ease'
                    }}
                >
                    <Typography
                        component="span"
                        sx={{
                            fontSize: '0.7em',
                            fontWeight: 'bold',
                            color: isMet ? '#a5d6a7' : (isAnd ? '#6496ff' : '#ff9664'),
                            mr: 0.5,
                        }}
                    >
                        {label}:
                    </Typography>
                    {parts.map((part, i) => (
                        <React.Fragment key={i}>
                            {part}
                            {i < parts.length - 1 && (
                                <Typography
                                    component="span"
                                    sx={{
                                        mx: 0.5,
                                        fontWeight: 'bold',
                                        color: isMet ? '#a5d6a7' : (isAnd ? '#6496ff' : '#ff9664'),
                                    }}
                                >
                                    {symbol}
                                </Typography>
                            )}
                        </React.Fragment>
                    ))}
                </Box>
            );
        }

        const { type, channel, operator, value } = condition;
        const opSymbols = { '=': '=', '==': '=', '!=': '≠', '<': '<', '>': '>', '<=': '≤', '>=': '≥', 'between': '↔' };
        const op = opSymbols[operator] || operator;

        let text = '?';
        let detailText = '';
        if (statusObj && statusObj.__actual !== undefined) {
            // Optional: show actual value if available
            // detailText = ` (${statusObj.__actual})`; 
        }

        switch (type) {
            case 'time':
                if (operator === 'between' && Array.isArray(value)) {
                    text = `🕐 ${value[0]} - ${value[1]}`;
                } else {
                    text = `🕐 ${op} ${value}`;
                }
                break;
            case 'date':
                if (operator === 'between' && Array.isArray(value)) {
                    text = `📅 ${value[0]} to ${value[1]}`;
                } else {
                    text = `📅 ${operator} ${value}`;
                }
                break;
            case 'sensor':
                if (value && value.type === 'dynamic') {
                    text = `📡 ${channel} ${op} (${value.channel} * ${value.factor} + ${value.offset})`;
                } else {
                    text = `📡 ${channel} ${op} ${value}`;
                }
                break;
            case 'output':
                text = `⚙️ ${channel} ${op} ${value}`;
                break;
            default:
                text = '?';
        }

        return (
            <Typography
                component="span"
                sx={{
                    bgcolor: isMet ? 'rgba(76, 175, 80, 0.4)' : 'rgba(255, 255, 255, 0.05)',
                    color: isMet ? '#fff' : 'inherit',
                    border: isMet ? '1px solid #4caf50' : 'none',
                    px: 0.5,
                    py: 0.25,
                    borderRadius: 0.5,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.3s ease'
                }}
                title={statusObj && statusObj.__actual !== undefined ? `Actual: ${statusObj.__actual}` : ''}
            >
                {text}{detailText}
            </Typography>
        );
    };

    // Format action for display
    formatRuleAction = (action) => {
        if (!action?.channel) return '?';
        const name = action.channel;

        if (action.value && action.value.type === 'calculated') {
            return `${name} = (${action.value.sensorA} - ${action.value.sensorB || '0'}) * ${action.value.factor} + ${action.value.offset}`;
        }

        return `${name} = ${action.value}`;
    };

    getNextColor(idx) {
        return GRUVBOX_COLORS[idx % GRUVBOX_COLORS.length];
    }

    handleOpenCreate = () => {
        this.setState({
            editingId: null,
            viewName: '',
            viewConfig: [],
            axisConfig: { left: { min: '', max: '' }, right: { min: '', max: '' } },
            open: true
        });
    };

    handleOpenEdit = (v, e) => {
        e.stopPropagation();
        fetch(`/api/views/${v.id}`)
            .then(res => res.json())
            .then(data => {
                const { channels, axes } = this.parseViewData(data);
                this.setState({
                    editingId: v.id,
                    viewName: v.name,
                    viewConfig: channels,
                    axisConfig: axes,
                    open: true
                });
            });
    };

    handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure?")) return;
        const { user } = this.props;
        await fetch(`/api/views/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        this.refreshViews();
    };

    moveView = async (idx, dir) => {
        const newViews = [...this.state.views];
        const target = idx + dir;
        if (target < 0 || target >= newViews.length) return;

        [newViews[idx], newViews[target]] = [newViews[target], newViews[idx]];
        this.setState({ views: newViews });

        const order = newViews.map((v, i) => ({ id: v.id, position: i }));
        const { user } = this.props;

        try {
            const res = await fetch('/api/views/reorder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({ order })
            });
            if (!res.ok) {
                const err = await res.json();
                console.error("Failed to save order:", err);
            }
        } catch (err) {
            console.error("Failed to save order", err);
        }
    };

    handleSave = async () => {
        const { viewName, viewConfig, axisConfig, editingId } = this.state;
        const { user } = this.props;

        if (!viewName || viewConfig.length === 0) return;

        const url = editingId ? `/api/views/${editingId}` : '/api/views';
        const method = editingId ? 'PUT' : 'POST';

        const finalConfig = {
            channels: viewConfig,
            axes: axisConfig
        };

        try {
            const res = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({ name: viewName, config: finalConfig })
            });

            if (res.ok) {
                this.setState({ open: false });
                this.refreshViews();
            } else {
                alert('Failed to save view');
            }
        } catch (err) {
            console.error(err);
        }
    };

    // --- Editor Logic ---
    addChannel = () => {
        const { paramSelDevice, paramSelChannel, paramAlias, paramYAxis, viewConfig } = this.state;
        if (!paramSelDevice || !paramSelChannel) return;

        const color = this.getNextColor(viewConfig.length);

        this.setState(prev => ({
            viewConfig: [...prev.viewConfig, {
                device: paramSelDevice,
                channel: paramSelChannel,
                alias: paramAlias || `${paramSelDevice}:${paramSelChannel}`,
                yAxis: paramYAxis,
                color: color
            }],
            paramSelDevice: '',
            paramSelChannel: '',
            paramAlias: '',
            paramYAxis: 'left'
        }));
    };

    removeChannel = (idx) => {
        this.setState(prev => ({
            viewConfig: prev.viewConfig.filter((_, i) => i !== idx)
        }));
    };

    moveChannel = (idx, dir) => {
        const newConfig = [...this.state.viewConfig];
        const target = idx + dir;
        if (target < 0 || target >= newConfig.length) return;
        [newConfig[idx], newConfig[target]] = [newConfig[target], newConfig[idx]];
        this.setState({ viewConfig: newConfig });
    };

    updateAxis = (axis, field, val) => {
        this.setState(prev => ({
            axisConfig: {
                ...prev.axisConfig,
                [axis]: { ...prev.axisConfig[axis], [field]: val }
            }
        }));
    };

    openColorPicker = (idx, mode = 'line') => {
        this.setState({ colorPickerOpen: true, pickerTargetIndex: idx, colorPickerMode: mode });
    };

    selectColor = (color) => {
        const { pickerTargetIndex, viewConfig, colorPickerMode } = this.state;
        if (pickerTargetIndex !== null) {
            const newConfig = viewConfig.map((ch, i) => {
                if (i === pickerTargetIndex) {
                    if (colorPickerMode === 'fill') {
                        return { ...ch, fillColor: color };
                    } else {
                        return { ...ch, color: color };
                    }
                }
                return ch;
            });
            this.setState({ viewConfig: newConfig, colorPickerOpen: false, pickerTargetIndex: null });
        }
    };

    clearFillColor = (idx) => {
        const newConfig = [...this.state.viewConfig];
        delete newConfig[idx].fillColor;
        delete newConfig[idx].fillOpacity;
        this.setState({ viewConfig: newConfig });
    };

    updateChannel = (idx, updates) => {
        const newConfig = this.state.viewConfig.map((ch, i) => {
            if (i === idx) return { ...ch, ...updates };
            return ch;
        });
        this.setState({ viewConfig: newConfig });
    };

    updateFillOpacity = (idx, value) => {
        const newConfig = this.state.viewConfig.map((ch, i) => {
            if (i === idx) {
                return { ...ch, fillOpacity: value };
            }
            return ch;
        });
        this.setState({ viewConfig: newConfig });
    };

    handleRangeChange = (e, newVal) => {
        if (newVal) this.setState({ rangeLabel: newVal });
    };

    handleTimeNav = (direction) => {
        const { windowEnd, rangeLabel } = this.state;
        const rangeMs = RANGES[rangeLabel];
        let currentEnd = windowEnd ? windowEnd.getTime() : Date.now();
        let newEnd = direction === -1 ? currentEnd - rangeMs : currentEnd + rangeMs;

        if (direction === 1 && newEnd >= Date.now()) {
            this.setState({ windowEnd: null });
        } else {
            this.setState({ windowEnd: new Date(newEnd) });
        }
    };

    handleAlignToPeriod = () => {
        const { rangeLabel } = this.state;
        const now = new Date();
        let periodEnd;

        switch (rangeLabel) {
            case '1d':
                // Midnight of tomorrow (so range - 24h = midnight today)
                periodEnd = new Date(now);
                periodEnd.setDate(periodEnd.getDate() + 1);
                periodEnd.setHours(0, 0, 0, 0);
                break;
            case '1w':
                // Midnight of next Monday (start of next week)
                periodEnd = new Date(now);
                const dayOfWeek = periodEnd.getDay(); // 0 = Sunday
                const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
                periodEnd.setDate(periodEnd.getDate() + daysUntilNextMonday);
                periodEnd.setHours(0, 0, 0, 0);
                break;
            case '1m':
                // First day of next month (midnight)
                periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
                break;
            case '3m':
                // First day of next quarter (midnight)
                const nextQuarterMonth = (Math.floor(now.getMonth() / 3) + 1) * 3;
                periodEnd = new Date(now.getFullYear(), nextQuarterMonth, 1, 0, 0, 0, 0);
                break;
            default:
                // For 3h or unsupported, don't change
                return;
        }
        // Set window end to the end of the period
        // This makes the chart show [period_start, period_end]
        // e.g., for 1d, shows 0:00 to 23:59:59 of today
        this.setState({ windowEnd: periodEnd });
    };

    render() {
        const {
            views, open, editingId, viewName, availableDevices,
            viewConfig, axisConfig,
            paramSelDevice, paramSelChannel, paramAlias, paramYAxis,
            rangeLabel, windowEnd, colorPickerOpen
        } = this.state;
        const isAdmin = this.isAdmin();

        const uniqueDevices = [...new Set(availableDevices.map(d => d.device))];
        const channelsForDevice = availableDevices.filter(d => d.device === paramSelDevice).map(d => d.channel);

        const rangeMs = RANGES[rangeLabel];
        let dateDisplay = "Live";
        if (windowEnd) {
            const start = new Date(windowEnd.getTime() - rangeMs);
            dateDisplay = `${start.toLocaleString()} - ${windowEnd.toLocaleString()}`;
        } else {
            dateDisplay = `Live (Last ${rangeLabel})`;
        }

        return (
            <Container maxWidth="xl" sx={{ mt: { xs: 1, sm: 2, md: 4 }, px: { xs: 1, sm: 2, md: 3 } }}>
                <Paper sx={{
                    position: 'sticky',
                    top: { xs: 0, sm: 10 },
                    zIndex: 1000,
                    p: { xs: 1, sm: 2 },
                    mb: { xs: 1, sm: 2, md: 4 },
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: { xs: 1, sm: 0 },
                    bgcolor: 'rgba(20, 30, 50, 0.95)',
                    border: '2px solid #1976d2',
                    borderRadius: { xs: 0, sm: 2 },
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 15px rgba(25, 118, 210, 0.3)',
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <ToggleButtonGroup
                            value={rangeLabel}
                            exclusive
                            onChange={this.handleRangeChange}
                            size="small"
                            sx={{
                                '& .MuiToggleButton-root': {
                                    transition: 'all 0.15s ease',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    '&:hover': {
                                        bgcolor: 'rgba(100, 180, 255, 0.3)',
                                        border: '2px solid #64b5f6',
                                        boxShadow: '0 0 15px rgba(100, 180, 255, 0.6), inset 0 0 8px rgba(100, 180, 255, 0.2)',
                                        transform: 'scale(1.08)',
                                        zIndex: 1,
                                        color: '#fff',
                                    },
                                    '&.Mui-selected': {
                                        bgcolor: '#1976d2',
                                        color: 'white',
                                        border: '2px solid #42a5f5',
                                        '&:hover': {
                                            bgcolor: '#1e88e5',
                                            boxShadow: '0 0 20px rgba(100, 180, 255, 0.8)',
                                        },
                                    },
                                },
                            }}
                        >
                            {Object.keys(RANGES).map(r => <ToggleButton key={r} value={r}>{r}</ToggleButton>)}
                        </ToggleButtonGroup>
                        <Box>
                            <IconButton onClick={() => this.handleTimeNav(-1)}><ArrowBackIcon /></IconButton>
                            <IconButton onClick={() => this.handleTimeNav(1)} disabled={!windowEnd}><ArrowForwardIcon /></IconButton>
                            {['1d', '1w', '1m', '3m'].includes(rangeLabel) && (
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={this.handleAlignToPeriod}
                                    sx={{
                                        ml: 1,
                                        minWidth: 'auto',
                                        fontSize: '0.75rem',
                                        px: 1,
                                    }}
                                    title={`Align to ${rangeLabel === '1d' ? 'today' : rangeLabel === '1w' ? 'this week' : rangeLabel === '1m' ? 'this month' : 'this quarter'}`}
                                >
                                    📅 Align
                                </Button>
                            )}
                        </Box>
                    </Box>
                    <Typography variant="h6" sx={{ display: { xs: 'none', md: 'block' }, fontSize: { sm: '0.9rem', md: '1.25rem' } }}>{dateDisplay}</Typography>
                    {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={this.handleOpenCreate}>Create View</Button>}
                </Paper>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1, sm: 2, md: 4 } }}>
                    {views.map((view, vIdx) => {
                        const { channels, axes } = this.parseViewData(view);
                        return (
                            <Box key={view.id} sx={{
                                p: { xs: 0.5, sm: 1, md: 1.5 },
                                bgcolor: 'background.paper',
                                borderRadius: 1,
                                height: { xs: '320px', sm: '420px', md: '520px' },
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Typography variant="h6" sx={{ fontSize: { xs: '0.9rem', sm: '1.1rem', md: '1.25rem' } }}>{view.name}</Typography>
                                        {isAdmin && (
                                            <>
                                                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => this.moveView(vIdx, -1)} disabled={vIdx === 0}><ArrowUpwardIcon sx={{ fontSize: '1rem' }} /></IconButton>
                                                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => this.moveView(vIdx, 1)} disabled={vIdx === views.length - 1}><ArrowDownwardIcon sx={{ fontSize: '1rem' }} /></IconButton>
                                            </>
                                        )}
                                    </Box>
                                    {isAdmin && (
                                        <Box>
                                            <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => this.handleOpenEdit(view, e)}><EditIcon sx={{ fontSize: '1rem' }} /></IconButton>
                                            <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => this.handleDelete(view.id, e)}><DeleteIcon sx={{ fontSize: '1rem' }} /></IconButton>
                                        </Box>
                                    )}
                                </Box>
                                <Box sx={{ flex: 1, minHeight: 0 }}>
                                    <Chart
                                        channelConfig={channels.map(c => ({
                                            id: `${c.device}:${c.channel}`,
                                            alias: c.alias,
                                            yAxis: c.yAxis || 'left',
                                            color: c.color,
                                            fillColor: c.fillColor,
                                            fillOpacity: c.fillOpacity,
                                            sma: c.sma || 0
                                        }))}
                                        axisConfig={axes}
                                        windowEnd={windowEnd}
                                        range={rangeMs}
                                    />
                                </Box>
                            </Box>
                        );
                    })}
                    {views.length === 0 && <Typography>No views available.</Typography>}

                    {/* Rules Summary */}
                    {this.state.rules.length > 0 && (
                        <Box sx={{ p: { xs: 0.5, sm: 1, md: 2 }, bgcolor: 'background.paper', borderRadius: 1 }}>
                            <Typography variant="h6" sx={{ mb: 1, fontSize: { xs: '0.9rem', sm: '1.1rem', md: '1.25rem' } }}>🤖 Active Rules</Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {this.state.rules.filter(r => r.enabled).map((rule, idx) => {
                                    const isActive = this.state.activeRuleIds.includes(rule.id);
                                    const statusObj = this.state.ruleStatuses ? this.state.ruleStatuses[rule.id] : null;

                                    return (
                                        <Box
                                            key={rule.id}
                                            sx={{
                                                border: isActive ? '1px solid #4caf50' : '1px solid rgba(255, 255, 255, 0.1)',
                                                bgcolor: isActive ? 'rgba(76, 175, 80, 0.05)' : 'rgba(0, 0, 0, 0.2)',
                                                p: { xs: 0.75, sm: 1, md: 1.5 },
                                                borderRadius: 1,
                                                display: 'flex',
                                                flexDirection: { xs: 'column', sm: 'row' },
                                                alignItems: { xs: 'flex-start', sm: 'center' },
                                                justifyContent: 'space-between',
                                                gap: { xs: 0.5, sm: 0 },
                                                opacity: isActive ? 1 : 0.7
                                            }}
                                        >
                                            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
                                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: isActive ? '#a5d6a7' : 'inherit', fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                                                        {this.getRuleEmoji(rule)} {rule.name || `Rule #${idx + 1}`}
                                                    </Typography>
                                                    {isActive && <Chip label="Active" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }} />}
                                                </Box>
                                                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', fontSize: { xs: '0.7rem', sm: '0.8rem' } }}>
                                                    IF {this.formatRuleConditions(rule.conditions || {}, 0, statusObj)} THEN {this.formatRuleAction(rule.action || {})}
                                                </Typography>
                                            </Box>
                                            {statusObj && statusObj.__actual !== undefined && (
                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                                    {Number(statusObj.__actual).toFixed(1)}
                                                </Typography>
                                            )}
                                        </Box>
                                    );
                                })}
                            </Box>
                        </Box>
                    )}

                    {/* Admin: All Outputs Control */}
                    {isAdmin && (
                        <Paper sx={{ p: 2, mt: 4, mb: 8, border: '1px solid #d79921', bgcolor: 'rgba(215, 153, 33, 0.05)' }}>
                            <Typography variant="h5" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SettingsInputComponentIcon color="primary" /> Output Override
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Manually override output values. Note that active rules will overwrite these values on the next tick (every 10s).
                                Unmapped outputs (not controlled by any rule) are highlighted with an icon.
                            </Typography>

                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
                                {(() => {
                                    // 1. Get all config channels
                                    const { outputValues, configs = [], rules = [] } = this.state;

                                    // Identify outputs controlled by rules
                                    const ruleControlledOutputs = new Set();
                                    rules.forEach(r => {
                                        if (!r.enabled) return;
                                        try {
                                            const action = r.action || {};
                                            if (action.channel) ruleControlledOutputs.add(action.channel);
                                        } catch (e) { }
                                    });

                                    // Check if configs is populated (we may need to fetch it if ViewManager doesn't have it yet)
                                    // Actually ViewManager didn't have configs in state, let's look at availableDevices or outputValues
                                    // Better: allow ViewManager to fetch '/api/outputs' (configs) on mount if admin.
                                    // For now, let's use outputValues keys combined with available devices or just iterate outputValues? 
                                    // outputValues only has values, not types. We need types.
                                    // Let's assume we fetch configs. If not, fallback to outputValues keys.

                                    const allChannels = new Set((this.state.outputConfigs || []).map(c => c.channel));
                                    const sortedChannels = Array.from(allChannels).sort();

                                    return sortedChannels.map(channel => {
                                        const config = (this.state.outputConfigs || []).find(c => c.channel === channel) || {};
                                        const isMapped = ruleControlledOutputs.has(channel);
                                        const value = outputValues[channel] || 0;
                                        const isBoolean = config.value_type
                                            ? config.value_type === 'boolean'
                                            : ((value === 0 || value === 1) && !channel.includes('Level')); // Guess bool if 0/1 AND name doesn't imply numeric

                                        return (
                                            <Paper
                                                key={channel}
                                                elevation={3}
                                                sx={{
                                                    p: 2,
                                                    borderLeft: isMapped ? '4px solid #4caf50' : '4px solid #fb4934',
                                                    bgcolor: 'rgba(255, 255, 255, 0.05)'
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                                    <Box>
                                                        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>{channel}</Typography>
                                                        {config.description && <Typography variant="caption" color="text.secondary">{config.description}</Typography>}
                                                    </Box>
                                                    {!isMapped && (
                                                        <Chip
                                                            icon={<LinkOffIcon sx={{ fontSize: '1rem !important' }} />}
                                                            label="Unmapped"
                                                            size="small"
                                                            color="error"
                                                            variant="outlined"
                                                            sx={{ height: 20, fontSize: '0.65rem' }}
                                                        />
                                                    )}
                                                </Box>

                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                                                    {isBoolean ? (
                                                        <FormControlLabel
                                                            control={
                                                                <Switch
                                                                    checked={value > 0}
                                                                    onChange={(e) => this.handleOutputChange(channel, e.target.checked ? 1 : 0)}
                                                                    color={isMapped ? "success" : "warning"}
                                                                />
                                                            }
                                                            label={value > 0 ? "ON" : "OFF"}
                                                        />
                                                    ) : (
                                                        <Box sx={{ width: '100%' }}>
                                                            <MuiLink sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <Typography variant="body2">Value: {value}</Typography>
                                                            </MuiLink>
                                                            <Slider
                                                                value={value}
                                                                min={config.min_value || 0}
                                                                max={config.max_value || 10}
                                                                step={0.1}
                                                                onChange={(e, val) => this.handleOutputChange(channel, val)}
                                                                valueLabelDisplay="auto"
                                                                sx={{ color: isMapped ? 'success.main' : 'warning.main' }}
                                                            />
                                                        </Box>
                                                    )}
                                                </Box>
                                            </Paper>
                                        );
                                    });
                                })()}
                            </Box>
                        </Paper>
                    )}
                </Box>


                {/* Scroll space at end of page */}
                <Box sx={{ height: 200 }} />

                <Dialog open={open} onClose={() => this.setState({ open: false })} maxWidth="lg" fullWidth>
                    <DialogTitle>{editingId ? 'Edit View' : 'Create New View'}</DialogTitle>
                    <DialogContent>
                        <TextField
                            margin="dense" label="View Name" fullWidth value={viewName}
                            onChange={(e) => this.setState({ viewName: e.target.value })} sx={{ mb: 2 }}
                        />

                        <Box sx={{ p: 2, border: '1px solid #444', borderRadius: 1, mb: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>Axis Configuration</Typography>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <Typography variant="caption" sx={{ width: 40 }}>Left:</Typography>
                                    <TextField size="small" placeholder="Min" value={axisConfig.left.min} onChange={e => this.updateAxis('left', 'min', e.target.value)} />
                                    <TextField size="small" placeholder="Max" value={axisConfig.left.max} onChange={e => this.updateAxis('left', 'max', e.target.value)} />
                                </Box>
                                <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <Typography variant="caption" sx={{ width: 40 }}>Right:</Typography>
                                    <TextField size="small" placeholder="Min" value={axisConfig.right.min} onChange={e => this.updateAxis('right', 'min', e.target.value)} />
                                    <TextField size="small" placeholder="Max" value={axisConfig.right.max} onChange={e => this.updateAxis('right', 'max', e.target.value)} />
                                </Box>
                            </Box>
                        </Box>

                        <Box sx={{ p: 2, border: '1px solid #444', borderRadius: 1 }}>
                            <Typography variant="subtitle2">Channels</Typography>
                            <List dense>
                                {viewConfig.map((ch, idx) => (
                                    <ListItem key={idx} sx={{ pl: 0 }}>
                                        <IconButton size="small" onClick={() => this.openColorPicker(idx, 'line')} title="Line color">
                                            <Box sx={{ width: 20, height: 20, bgcolor: ch.color || '#fff', borderRadius: '50%', border: '2px solid #fff' }} />
                                        </IconButton>
                                        <IconButton size="small" onClick={() => this.openColorPicker(idx, 'fill')} title="Fill color (area)">
                                            <Box sx={{ width: 20, height: 20, bgcolor: ch.fillColor || 'transparent', borderRadius: '50%', border: ch.fillColor ? '2px solid #fff' : '2px dashed #666' }} />
                                        </IconButton>
                                        {ch.fillColor && (
                                            <>
                                                <Slider
                                                    size="small"
                                                    value={ch.fillOpacity ?? 0.5}
                                                    min={0.1}
                                                    max={1}
                                                    step={0.1}
                                                    onChange={(e, val) => this.updateFillOpacity(idx, val)}
                                                    sx={{ width: 60, ml: 1 }}
                                                    title="Fill opacity"
                                                />
                                                <IconButton size="small" onClick={() => this.clearFillColor(idx)} title="Remove fill" sx={{ ml: -0.5 }}>
                                                    <DeleteIcon sx={{ fontSize: 14 }} />
                                                </IconButton>
                                            </>
                                        )}
                                        <Select
                                            size="small"
                                            value={ch.sma || 0}
                                            onChange={e => this.updateChannel(idx, { sma: e.target.value })}
                                            sx={{ width: 100, ml: 1 }}
                                            title="Simple Moving Average"
                                        >
                                            <MenuItem value="" disabled><em>SMA</em></MenuItem>
                                            {SMA_OPTIONS.map(opt => (
                                                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                            ))}
                                        </Select>
                                        <TextField
                                            size="small"
                                            value={ch.alias}
                                            onChange={e => this.updateChannel(idx, { alias: e.target.value })}
                                            sx={{ ml: 1, flex: 1, minWidth: 100 }}
                                            placeholder="Alias"
                                        />
                                        <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                                            {ch.device}:{ch.channel}
                                        </Typography>
                                        <Select
                                            size="small"
                                            value={ch.yAxis || 'left'}
                                            onChange={e => this.updateChannel(idx, { yAxis: e.target.value })}
                                            sx={{ width: 85, ml: 1 }}
                                        >
                                            <MenuItem value="left">Left</MenuItem>
                                            <MenuItem value="right">Right</MenuItem>
                                        </Select>
                                        <IconButton size="small" onClick={() => this.moveChannel(idx, -1)} disabled={idx === 0}><ArrowUpwardIcon /></IconButton>
                                        <IconButton size="small" onClick={() => this.moveChannel(idx, 1)} disabled={idx === viewConfig.length - 1}><ArrowDownwardIcon /></IconButton>
                                        <IconButton size="small" color="error" onClick={() => this.removeChannel(idx)}><DeleteIcon /></IconButton>
                                    </ListItem>
                                ))}
                            </List>

                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1, bgcolor: '#32302f', p: 1, borderRadius: 1 }}>
                                <Select size="small" value={paramSelDevice} displayEmpty onChange={e => this.setState({ paramSelDevice: e.target.value })} sx={{ minWidth: 120 }}>
                                    <MenuItem value=""><em>Device</em></MenuItem>
                                    {uniqueDevices.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                                </Select>
                                <Select size="small" value={paramSelChannel} displayEmpty onChange={e => this.setState({ paramSelChannel: e.target.value })} sx={{ minWidth: 120 }}>
                                    <MenuItem value=""><em>Channel</em></MenuItem>
                                    {channelsForDevice.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                </Select>
                                <Select size="small" value={paramYAxis} onChange={e => this.setState({ paramYAxis: e.target.value })} sx={{ width: 80 }}>
                                    <MenuItem value="left">Left</MenuItem>
                                    <MenuItem value="right">Right</MenuItem>
                                </Select>
                                <TextField size="small" placeholder="Alias" value={paramAlias} onChange={e => this.setState({ paramAlias: e.target.value })} />
                                <Button variant="contained" size="small" onClick={this.addChannel}>Add</Button>
                            </Box>
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => this.setState({ open: false })}>Cancel</Button>
                        <Button onClick={this.handleSave} variant="contained">Save</Button>
                    </DialogActions>
                </Dialog>

                <Dialog open={colorPickerOpen} onClose={() => this.setState({ colorPickerOpen: false })}>
                    <DialogTitle>Select Color</DialogTitle>
                    <DialogContent>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, width: 300 }}>
                            {GRUVBOX_COLORS.map(c => (
                                <Box
                                    key={c}
                                    onClick={() => this.selectColor(c)}
                                    sx={{
                                        width: 40, height: 40, bgcolor: c, cursor: 'pointer', borderRadius: 1,
                                        border: '1px solid #000',
                                        '&:hover': { opacity: 0.8 }
                                    }}
                                />
                            ))}
                        </Box>
                    </DialogContent>
                </Dialog>

                <Snackbar
                    open={this.state.snackbarOpen}
                    autoHideDuration={6000}
                    onClose={this.handleCloseSnackbar}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                >
                    <Alert onClose={this.handleCloseSnackbar} severity={this.state.snackbarSeverity} sx={{ width: '100%' }}>
                        {this.state.snackbarMessage}
                    </Alert>
                </Snackbar>
            </Container>
        );
    }
}

export default withRouter(ViewManager);
