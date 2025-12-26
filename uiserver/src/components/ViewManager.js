import React, { Component } from 'react';
import {
    Container, Typography, Paper, List, ListItem, ListItemText, ListItemIcon,
    Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
    FormControl, InputLabel, Select, MenuItem, Box, Chip, IconButton,
    ToggleButton, ToggleButtonGroup, Slider
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { withRouter } from './withRouter';
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
            outputValues: {},
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
            windowEnd: null // null = Live
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
            .then(data => this.setState({ activeRuleIds: data.activeIds || [] }))
            .catch(console.error);
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
    formatRuleConditions = (condition, depth = 0) => {
        if (!condition) return <span style={{ color: '#888' }}>(always)</span>;

        if (condition.operator === 'AND' || condition.operator === 'OR') {
            const parts = (condition.conditions || []).map((c, i) => this.formatRuleConditions(c, depth + 1)).filter(Boolean);
            if (parts.length === 0) return <span style={{ color: '#888' }}>(always)</span>;

            const isAnd = condition.operator === 'AND';
            const borderColor = isAnd ? 'rgba(100, 150, 255, 0.5)' : 'rgba(255, 150, 100, 0.5)';
            const bgColor = isAnd ? 'rgba(100, 150, 255, 0.08)' : 'rgba(255, 150, 100, 0.08)';
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
                    }}
                >
                    <Typography
                        component="span"
                        sx={{
                            fontSize: '0.7em',
                            fontWeight: 'bold',
                            color: isAnd ? '#6496ff' : '#ff9664',
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
                                        color: isAnd ? '#6496ff' : '#ff9664',
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
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                    px: 0.5,
                    py: 0.25,
                    borderRadius: 0.5,
                    whiteSpace: 'nowrap',
                }}
            >
                {text}
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
            <Container maxWidth="xl" sx={{ mt: 4 }}>
                <Paper sx={{
                    position: 'sticky',
                    top: 10,
                    zIndex: 1000,
                    p: 2,
                    mb: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    bgcolor: 'rgba(20, 30, 50, 0.95)',
                    border: '2px solid #1976d2',
                    borderRadius: 2,
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
                    <Typography variant="h6">{dateDisplay}</Typography>
                    {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={this.handleOpenCreate}>Create View</Button>}
                </Paper>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {views.map((view, vIdx) => {
                        const { channels, axes } = this.parseViewData(view);
                        return (
                            <Paper key={view.id} sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="h4">{view.name}</Typography>
                                        {isAdmin && (
                                            <>
                                                <IconButton size="small" onClick={() => this.moveView(vIdx, -1)} disabled={vIdx === 0}><ArrowUpwardIcon /></IconButton>
                                                <IconButton size="small" onClick={() => this.moveView(vIdx, 1)} disabled={vIdx === views.length - 1}><ArrowDownwardIcon /></IconButton>
                                            </>
                                        )}
                                    </Box>
                                    {isAdmin && (
                                        <Box>
                                            <IconButton onClick={(e) => this.handleOpenEdit(view, e)}><EditIcon /></IconButton>
                                            <IconButton onClick={(e) => this.handleDelete(view.id, e)}><DeleteIcon /></IconButton>
                                        </Box>
                                    )}
                                </Box>
                                <Box sx={{ height: '500px' }}>
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
                            </Paper>
                        );
                    })}
                    {views.length === 0 && <Typography>No views available.</Typography>}

                    {/* Rules Summary */}
                    {this.state.rules.length > 0 && (
                        <Paper sx={{ p: 2, mt: 4 }}>
                            <Typography variant="h5" sx={{ mb: 2 }}>🤖 Active Rules</Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {this.state.rules.filter(r => r.enabled).map((rule, idx) => {
                                    const isActive = this.state.activeRuleIds.includes(rule.id);
                                    return (
                                        <Box
                                            key={rule.id}
                                            sx={{
                                                p: 1.5,
                                                bgcolor: isActive ? 'rgba(76, 175, 80, 0.15)' : 'background.paper',
                                                borderRadius: 1,
                                                border: isActive ? '1px solid #4caf50' : '1px solid #504945',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 2
                                            }}
                                        >
                                            <Typography sx={{ fontSize: '1.2em' }}>
                                                {this.getRuleEmoji(rule)}
                                            </Typography>
                                            <Box sx={{ flex: 1 }}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                    {rule.name}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {this.formatRuleConditions(rule.conditions)} → {this.formatRuleAction(rule.action)}
                                                </Typography>
                                            </Box>
                                            <Typography sx={{ fontSize: '0.85em', color: 'text.secondary' }}>
                                                #{idx + 1}
                                            </Typography>
                                        </Box>
                                    );
                                })}
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
            </Container>
        );
    }
}

export default withRouter(ViewManager);
