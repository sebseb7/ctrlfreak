import React, { Component } from 'react';
import {
    Container, Typography, Paper, List, ListItem, ListItemText, ListItemIcon,
    Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
    FormControl, InputLabel, Select, MenuItem, Box, IconButton, Switch,
    FormControlLabel, Chip, Divider, Tooltip
} from '@mui/material';
import RuleIcon from '@mui/icons-material/Rule';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';

// Condition operators by type
const CONDITION_OPERATORS = {
    time: [
        { value: 'between', label: 'Between' },
        { value: '=', label: '=' },
        { value: '<', label: '<' },
        { value: '>', label: '>' }
    ],
    date: [
        { value: 'before', label: 'Before' },
        { value: 'after', label: 'After' },
        { value: 'between', label: 'Between' }
    ],
    sensor: [
        { value: '=', label: '=' },
        { value: '!=', label: '!=' },
        { value: '<', label: '<' },
        { value: '>', label: '>' },
        { value: '<=', label: '<=' },
        { value: '>=', label: '>=' }
    ],
    output: [
        { value: '=', label: '=' },
        { value: '!=', label: '!=' },
        { value: '<', label: '<' },
        { value: '>', label: '>' },
        { value: '<=', label: '<=' },
        { value: '>=', label: '>=' }
    ]
};

class RuleEditor extends Component {
    constructor(props) {
        super(props);
        this.state = {
            rules: [],
            outputChannels: [],
            devices: [],
            outputValues: {},

            // Dialog state
            open: false,
            editingId: null,
            ruleName: '',
            ruleEnabled: true,
            conditions: { operator: 'AND', conditions: [] },
            action: { channel: '', value: 0 }
        };
    }

    componentDidMount() {
        this.refreshRules();
        this.loadOutputChannels();
        this.loadDevices();
        this.loadOutputValues();
        // Refresh output values every 10s
        this.refreshInterval = setInterval(() => this.loadOutputValues(), 10000);
    }

    componentWillUnmount() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
    }

    isAdmin() {
        const { user } = this.props;
        return user && user.role === 'admin';
    }

    refreshRules = () => {
        fetch('/api/rules')
            .then(res => res.json())
            .then(rules => this.setState({ rules }))
            .catch(console.error);
    };

    loadOutputChannels = () => {
        fetch('/api/outputs')
            .then(res => res.json())
            .then(outputChannels => this.setState({ outputChannels }))
            .catch(console.error);
    };

    loadDevices = () => {
        fetch('/api/devices')
            .then(res => res.json())
            .then(devices => this.setState({ devices }))
            .catch(console.error);
    };

    loadOutputValues = () => {
        fetch('/api/outputs/values')
            .then(res => res.json())
            .then(outputValues => this.setState({ outputValues }))
            .catch(console.error);
    };

    // Dialog handlers
    handleOpenCreate = () => {
        this.setState({
            editingId: null,
            ruleName: '',
            ruleEnabled: true,
            conditions: { operator: 'AND', conditions: [] },
            action: { channel: this.state.outputChannels[0]?.channel || '', value: 0 },
            open: true
        });
    };

    handleOpenEdit = (rule, e) => {
        e.stopPropagation();
        this.setState({
            editingId: rule.id,
            ruleName: rule.name,
            ruleEnabled: !!rule.enabled,
            conditions: rule.conditions || { operator: 'AND', conditions: [] },
            action: rule.action || { channel: '', value: 0 },
            open: true
        });
    };

    handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm("Delete this rule?")) return;
        const { user } = this.props;
        await fetch(`/api/rules/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        this.refreshRules();
    };

    moveRule = async (idx, dir) => {
        const newRules = [...this.state.rules];
        const target = idx + dir;
        if (target < 0 || target >= newRules.length) return;

        [newRules[idx], newRules[target]] = [newRules[target], newRules[idx]];
        this.setState({ rules: newRules });

        const order = newRules.map((r, i) => ({ id: r.id, position: i }));
        const { user } = this.props;

        try {
            await fetch('/api/rules/reorder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({ order })
            });
        } catch (err) {
            console.error("Failed to save order", err);
        }
    };

    handleSave = async () => {
        const { ruleName, ruleEnabled, conditions, action, editingId } = this.state;
        const { user } = this.props;

        if (!ruleName || !action.channel) {
            alert('Please fill in all required fields');
            return;
        }

        const url = editingId ? `/api/rules/${editingId}` : '/api/rules';
        const method = editingId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({
                    name: ruleName,
                    enabled: ruleEnabled,
                    conditions,
                    action
                })
            });

            if (res.ok) {
                this.setState({ open: false });
                this.refreshRules();
            } else {
                const err = await res.json();
                alert('Failed to save rule: ' + err.error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    toggleRuleEnabled = async (rule) => {
        const { user } = this.props;
        try {
            await fetch(`/api/rules/${rule.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({
                    ...rule,
                    enabled: !rule.enabled
                })
            });
            this.refreshRules();
        } catch (err) {
            console.error(err);
        }
    };

    // Condition editing
    addCondition = (parentPath = []) => {
        this.setState(prev => {
            const newConditions = JSON.parse(JSON.stringify(prev.conditions));
            let target = newConditions;
            for (const idx of parentPath) {
                target = target.conditions[idx];
            }
            target.conditions.push({
                type: 'sensor',
                operator: '>',
                channel: '',
                value: 0
            });
            return { conditions: newConditions };
        });
    };

    addConditionGroup = (parentPath = [], groupType = 'AND') => {
        this.setState(prev => {
            const newConditions = JSON.parse(JSON.stringify(prev.conditions));
            let target = newConditions;
            for (const idx of parentPath) {
                target = target.conditions[idx];
            }
            target.conditions.push({
                operator: groupType,
                conditions: []
            });
            return { conditions: newConditions };
        });
    };

    updateCondition = (path, updates) => {
        this.setState(prev => {
            const newConditions = JSON.parse(JSON.stringify(prev.conditions));
            let target = newConditions;
            for (let i = 0; i < path.length - 1; i++) {
                target = target.conditions[path[i]];
            }
            const idx = path[path.length - 1];
            target.conditions[idx] = { ...target.conditions[idx], ...updates };
            return { conditions: newConditions };
        });
    };

    removeCondition = (path) => {
        this.setState(prev => {
            const newConditions = JSON.parse(JSON.stringify(prev.conditions));
            let target = newConditions;
            for (let i = 0; i < path.length - 1; i++) {
                target = target.conditions[path[i]];
            }
            const idx = path[path.length - 1];
            target.conditions.splice(idx, 1);
            return { conditions: newConditions };
        });
    };

    toggleGroupOperator = (path) => {
        this.setState(prev => {
            const newConditions = JSON.parse(JSON.stringify(prev.conditions));
            let target = newConditions;
            for (const idx of path) {
                target = target.conditions[idx];
            }
            if (path.length === 0) {
                // Root level
                newConditions.operator = newConditions.operator === 'AND' ? 'OR' : 'AND';
            } else {
                target.operator = target.operator === 'AND' ? 'OR' : 'AND';
            }
            return { conditions: newConditions };
        });
    };

    // Render a condition group recursively
    renderConditionGroup = (group, path = []) => {
        const { devices, outputChannels } = this.state;
        const isRoot = path.length === 0;

        // Build sensor channels list
        const sensorChannels = devices.map(d => `${d.device}:${d.channel}`);

        return (
            <Box sx={{
                pl: isRoot ? 0 : 2,
                borderLeft: isRoot ? 'none' : '2px solid',
                borderColor: group.operator === 'AND' ? '#83a598' : '#fabd2f',
                ml: isRoot ? 0 : 1,
                mb: 1
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Chip
                        label={group.operator}
                        size="small"
                        color={group.operator === 'AND' ? 'primary' : 'warning'}
                        onClick={this.isAdmin() ? () => this.toggleGroupOperator(path) : undefined}
                        sx={{ cursor: this.isAdmin() ? 'pointer' : 'default' }}
                    />
                    {this.isAdmin() && (
                        <>
                            <Button size="small" onClick={() => this.addCondition(path)}>+ Condition</Button>
                            <Button size="small" onClick={() => this.addConditionGroup(path, 'AND')}>+ AND Group</Button>
                            <Button size="small" onClick={() => this.addConditionGroup(path, 'OR')}>+ OR Group</Button>
                        </>
                    )}
                </Box>

                {group.conditions?.map((cond, idx) => {
                    const condPath = [...path, idx];

                    // Nested group
                    if (cond.operator === 'AND' || cond.operator === 'OR') {
                        return (
                            <Box key={idx} sx={{ mb: 1 }}>
                                {this.renderConditionGroup(cond, condPath)}
                                {this.isAdmin() && (
                                    <IconButton size="small" color="error" onClick={() => this.removeCondition(condPath)}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                )}
                            </Box>
                        );
                    }

                    // Single condition
                    return (
                        <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                            <Select
                                size="small"
                                value={cond.type || 'sensor'}
                                onChange={e => this.updateCondition(condPath, { type: e.target.value, operator: CONDITION_OPERATORS[e.target.value][0].value })}
                                disabled={!this.isAdmin()}
                                sx={{ minWidth: 100 }}
                            >
                                <MenuItem value="time">Time</MenuItem>
                                <MenuItem value="date">Date</MenuItem>
                                <MenuItem value="sensor">Sensor</MenuItem>
                                <MenuItem value="output">Output</MenuItem>
                            </Select>

                            {(cond.type === 'sensor' || cond.type === 'output') && (
                                <Select
                                    size="small"
                                    value={cond.channel || ''}
                                    onChange={e => this.updateCondition(condPath, { channel: e.target.value })}
                                    disabled={!this.isAdmin()}
                                    displayEmpty
                                    sx={{ minWidth: 180 }}
                                >
                                    <MenuItem value=""><em>Select Channel</em></MenuItem>
                                    {(cond.type === 'sensor' ? sensorChannels : outputChannels.map(c => c.channel))
                                        .map(ch => <MenuItem key={ch} value={ch}>{ch}</MenuItem>)}
                                </Select>
                            )}

                            <Select
                                size="small"
                                value={cond.operator || '='}
                                onChange={e => this.updateCondition(condPath, { operator: e.target.value })}
                                disabled={!this.isAdmin()}
                                sx={{ minWidth: 80 }}
                            >
                                {(CONDITION_OPERATORS[cond.type] || CONDITION_OPERATORS.sensor).map(op => (
                                    <MenuItem key={op.value} value={op.value}>{op.label}</MenuItem>
                                ))}
                            </Select>

                            {cond.operator === 'between' ? (
                                <>
                                    <TextField
                                        size="small"
                                        type={cond.type === 'time' ? 'time' : 'date'}
                                        value={Array.isArray(cond.value) ? cond.value[0] : ''}
                                        onChange={e => this.updateCondition(condPath, { value: [e.target.value, (cond.value?.[1] || '')] })}
                                        disabled={!this.isAdmin()}
                                        sx={{ width: 140 }}
                                    />
                                    <Typography>to</Typography>
                                    <TextField
                                        size="small"
                                        type={cond.type === 'time' ? 'time' : 'date'}
                                        value={Array.isArray(cond.value) ? cond.value[1] : ''}
                                        onChange={e => this.updateCondition(condPath, { value: [(cond.value?.[0] || ''), e.target.value] })}
                                        disabled={!this.isAdmin()}
                                        sx={{ width: 140 }}
                                    />
                                </>
                            ) : (
                                cond.type === 'sensor' ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {/* Dynamic Target Toggle */}
                                        <Tooltip title="Compare to Value or Another Sensor">
                                            <Chip
                                                label={cond.value?.type === 'dynamic' ? 'Sensor' : 'Value'}
                                                size="small"
                                                color={cond.value?.type === 'dynamic' ? 'secondary' : 'default'}
                                                onClick={this.isAdmin() ? () => {
                                                    const isDynamic = cond.value?.type === 'dynamic';
                                                    this.updateCondition(condPath, {
                                                        value: isDynamic
                                                            ? 0 // Switch to static
                                                            : { type: 'dynamic', channel: '', factor: 1, offset: 0 } // Switch to dynamic
                                                    });
                                                } : undefined}
                                                sx={{ cursor: this.isAdmin() ? 'pointer' : 'default', minWidth: 60 }}
                                            />
                                        </Tooltip>

                                        {cond.value?.type === 'dynamic' ? (
                                            <>
                                                <Select
                                                    size="small"
                                                    value={cond.value.channel || ''}
                                                    onChange={e => this.updateCondition(condPath, { value: { ...cond.value, channel: e.target.value } })}
                                                    disabled={!this.isAdmin()}
                                                    displayEmpty
                                                    sx={{ minWidth: 150 }}
                                                >
                                                    <MenuItem value=""><em>Target Sensor</em></MenuItem>
                                                    {sensorChannels.map(ch => <MenuItem key={ch} value={ch}>{ch}</MenuItem>)}
                                                </Select>
                                                <Typography>*</Typography>
                                                <TextField
                                                    size="small"
                                                    label="Factor"
                                                    type="number"
                                                    value={cond.value.factor}
                                                    onChange={e => this.updateCondition(condPath, { value: { ...cond.value, factor: parseFloat(e.target.value) || 0 } })}
                                                    disabled={!this.isAdmin()}
                                                    sx={{ width: 70 }}
                                                />
                                                <Typography>+</Typography>
                                                <TextField
                                                    size="small"
                                                    label="Offset"
                                                    type="number"
                                                    value={cond.value.offset}
                                                    onChange={e => this.updateCondition(condPath, { value: { ...cond.value, offset: parseFloat(e.target.value) || 0 } })}
                                                    disabled={!this.isAdmin()}
                                                    sx={{ width: 70 }}
                                                />
                                            </>
                                        ) : (
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={cond.value ?? ''}
                                                onChange={e => this.updateCondition(condPath, { value: parseFloat(e.target.value) || 0 })}
                                                disabled={!this.isAdmin()}
                                                sx={{ width: 140 }}
                                            />
                                        )}
                                    </Box>
                                ) : (
                                    <TextField
                                        size="small"
                                        type={cond.type === 'time' ? 'time' : (cond.type === 'date' ? 'date' : 'number')}
                                        value={cond.value ?? ''}
                                        onChange={e => this.updateCondition(condPath, {
                                            value: cond.type === 'output'
                                                ? parseFloat(e.target.value) || 0
                                                : e.target.value
                                        })}
                                        disabled={!this.isAdmin()}
                                        sx={{ width: 140 }}
                                    />
                                )
                            )}

                            {this.isAdmin() && (
                                <IconButton size="small" color="error" onClick={() => this.removeCondition(condPath)}>
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            )}
                        </Box>
                    );
                })}
            </Box>
        );
    };

    formatConditionSummary = (condition) => {
        if (!condition) return '';

        if (condition.operator === 'AND' || condition.operator === 'OR') {
            const parts = (condition.conditions || []).map(c => this.formatConditionSummary(c)).filter(Boolean);
            return parts.length > 0 ? `(${parts.join(` ${condition.operator} `)})` : '';
        }

        const { type, channel, operator, value } = condition;
        let formatted = '';

        switch (type) {
            case 'time':
                formatted = operator === 'between'
                    ? `${value?.[0] || '?'} - ${value?.[1] || '?'}`
                    : `time ${operator} ${value}`;
                break;
            case 'date':
                formatted = operator === 'between'
                    ? `date ${value?.[0] || '?'} to ${value?.[1] || '?'}`
                    : `date ${operator} ${value}`;
                break;
            case 'sensor':
                if (value && value.type === 'dynamic') {
                    formatted = `${channel} ${operator} (${value.channel} * ${value.factor} + ${value.offset})`;
                } else {
                    formatted = `${channel || '?'} ${operator} ${value}`;
                }
                break;
            case 'output':
                formatted = `${channel || '?'} ${operator} ${value}`;
                break;
            default:
                formatted = JSON.stringify(condition);
        }

        return formatted;
    };

    render() {
        const { rules, outputChannels, outputValues, open, editingId, ruleName, ruleEnabled, conditions, action } = this.state;
        const isAdmin = this.isAdmin();

        return (
            <Container maxWidth="xl" sx={{ mt: 4 }}>
                <Paper sx={{ p: 2, mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h5">
                        <RuleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        Rule Editor
                    </Typography>
                    {isAdmin && (
                        <Button variant="contained" startIcon={<AddIcon />} onClick={this.handleOpenCreate}>
                            Create Rule
                        </Button>
                    )}
                </Paper>

                {/* Current Output Values */}
                <Paper sx={{ p: 2, mb: 4 }}>
                    <Typography variant="h6" gutterBottom>Current Output Values</Typography>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        {outputChannels.map(ch => (
                            <Chip
                                key={ch.channel}
                                label={`${ch.description}: ${outputValues[ch.channel] ?? 0}`}
                                color={outputValues[ch.channel] > 0 ? 'success' : 'default'}
                                variant="outlined"
                            />
                        ))}
                    </Box>
                </Paper>

                {/* Rules List */}
                <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>Rules (Priority Order)</Typography>
                    <List>
                        {rules.map((rule, idx) => (
                            <ListItem
                                key={rule.id}
                                sx={{
                                    bgcolor: rule.enabled ? 'transparent' : 'rgba(0,0,0,0.2)',
                                    borderRadius: 1,
                                    mb: 1,
                                    border: '1px solid #504945'
                                }}
                            >
                                <ListItemIcon>
                                    {isAdmin ? (
                                        <IconButton onClick={() => this.toggleRuleEnabled(rule)}>
                                            {rule.enabled ? <PlayArrowIcon color="success" /> : <PauseIcon color="disabled" />}
                                        </IconButton>
                                    ) : (
                                        rule.enabled ? <PlayArrowIcon color="success" /> : <PauseIcon color="disabled" />
                                    )}
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="subtitle1">{rule.name}</Typography>
                                            <Chip size="small" label={rule.type || 'static'} />
                                        </Box>
                                    }
                                    secondary={
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">
                                                When: {this.formatConditionSummary(rule.conditions)}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Then: Set {rule.action?.channel} = {
                                                    rule.action?.value?.type === 'calculated'
                                                        ? `(${rule.action.value.sensorA} - ${rule.action.value.sensorB || '0'}) * ${rule.action.value.factor} + ${rule.action.value.offset}`
                                                        : rule.action?.value
                                                }
                                            </Typography>
                                        </Box>
                                    }
                                />
                                {isAdmin && (
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <IconButton size="small" onClick={() => this.moveRule(idx, -1)} disabled={idx === 0}>
                                            <ArrowUpwardIcon />
                                        </IconButton>
                                        <IconButton size="small" onClick={() => this.moveRule(idx, 1)} disabled={idx === rules.length - 1}>
                                            <ArrowDownwardIcon />
                                        </IconButton>
                                        <IconButton onClick={(e) => this.handleOpenEdit(rule, e)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton color="error" onClick={(e) => this.handleDelete(rule.id, e)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Box>
                                )}
                            </ListItem>
                        ))}
                        {rules.length === 0 && (
                            <Typography color="text.secondary" sx={{ p: 2 }}>
                                No rules defined. {isAdmin ? 'Click "Create Rule" to add one.' : ''}
                            </Typography>
                        )}
                    </List>
                </Paper>

                {/* Edit/Create Dialog */}
                <Dialog open={open} onClose={() => this.setState({ open: false })} maxWidth="md" fullWidth>
                    <DialogTitle>{editingId ? 'Edit Rule' : 'Create New Rule'}</DialogTitle>
                    <DialogContent>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, mt: 1 }}>
                            <TextField
                                label="Rule Name"
                                value={ruleName}
                                onChange={e => this.setState({ ruleName: e.target.value })}
                                fullWidth
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={ruleEnabled}
                                        onChange={e => this.setState({ ruleEnabled: e.target.checked })}
                                    />
                                }
                                label="Enabled"
                            />
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="subtitle1" gutterBottom>Conditions (When)</Typography>
                        <Box sx={{ p: 2, border: '1px solid #444', borderRadius: 1, mb: 2 }}>
                            {this.renderConditionGroup(conditions)}
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="subtitle1" gutterBottom>Action (Then)</Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {/* Value Type Toggle */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2">Value Type:</Typography>
                                <Chip
                                    label={action.value?.type === 'calculated' ? 'Calculated' : 'Static'}
                                    color={action.value?.type === 'calculated' ? 'secondary' : 'default'}
                                    onClick={() => this.setState({
                                        action: {
                                            ...action,
                                            value: action.value?.type === 'calculated'
                                                ? 0 // Reset to static
                                                : { type: 'calculated', sensorA: '', sensorB: '', factor: 1, offset: 0 }
                                        }
                                    })}
                                    sx={{ cursor: 'pointer' }}
                                />
                            </Box>

                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Typography>Set</Typography>
                                <Select
                                    size="small"
                                    value={action.channel}
                                    onChange={e => this.setState({ action: { ...action, channel: e.target.value } })}
                                    sx={{ minWidth: 200 }}
                                >
                                    {outputChannels.map(ch => (
                                        <MenuItem key={ch.channel} value={ch.channel}>
                                            {ch.description} ({ch.channel})
                                        </MenuItem>
                                    ))}
                                </Select>
                                <Typography>=</Typography>

                                {action.value?.type === 'calculated' ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, border: '1px solid #444', borderRadius: 1 }}>
                                        <Typography>(</Typography>
                                        <Select
                                            size="small"
                                            value={action.value.sensorA || ''}
                                            onChange={e => this.setState({
                                                action: {
                                                    ...action,
                                                    value: { ...action.value, sensorA: e.target.value }
                                                }
                                            })}
                                            displayEmpty
                                            sx={{ minWidth: 150 }}
                                        >
                                            <MenuItem value=""><em>Sensor A</em></MenuItem>
                                            {this.state.devices.map(d => `${d.device}:${d.channel}`).map(ch => (
                                                <MenuItem key={ch} value={ch}>{ch}</MenuItem>
                                            ))}
                                        </Select>
                                        <Typography>-</Typography>
                                        <Select
                                            size="small"
                                            value={action.value.sensorB || ''}
                                            onChange={e => this.setState({
                                                action: {
                                                    ...action,
                                                    value: { ...action.value, sensorB: e.target.value }
                                                }
                                            })}
                                            displayEmpty
                                            sx={{ minWidth: 150 }}
                                        >
                                            <MenuItem value=""><em>Sensor B (0)</em></MenuItem>
                                            {this.state.devices.map(d => `${d.device}:${d.channel}`).map(ch => (
                                                <MenuItem key={ch} value={ch}>{ch}</MenuItem>
                                            ))}
                                        </Select>
                                        <Typography>)</Typography>
                                        <Typography>*</Typography>
                                        <TextField
                                            size="small"
                                            type="number"
                                            label="Factor"
                                            value={action.value.factor}
                                            onChange={e => this.setState({
                                                action: {
                                                    ...action,
                                                    value: { ...action.value, factor: parseFloat(e.target.value) || 0 }
                                                }
                                            })}
                                            sx={{ width: 80 }}
                                        />
                                        <Typography>+</Typography>
                                        <TextField
                                            size="small"
                                            type="number"
                                            label="Offset"
                                            value={action.value.offset}
                                            onChange={e => this.setState({
                                                action: {
                                                    ...action,
                                                    value: { ...action.value, offset: parseFloat(e.target.value) || 0 }
                                                }
                                            })}
                                            sx={{ width: 80 }}
                                        />
                                    </Box>
                                ) : (
                                    <TextField
                                        size="small"
                                        type="number"
                                        value={action.value}
                                        onChange={e => this.setState({ action: { ...action, value: parseFloat(e.target.value) || 0 } })}
                                        inputProps={{
                                            min: outputChannels.find(c => c.channel === action.channel)?.min || 0,
                                            max: outputChannels.find(c => c.channel === action.channel)?.max || 10
                                        }}
                                        sx={{ width: 100 }}
                                    />
                                )}
                            </Box>
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => this.setState({ open: false })}>Cancel</Button>
                        <Button onClick={this.handleSave} variant="contained">Save</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        );
    }
}

export default RuleEditor;
