import React, { Component } from 'react';
import {
    Container, Typography, Paper, List, ListItem, ListItemText,
    Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
    FormControl, InputLabel, Select, MenuItem, Box, IconButton,
    Chip, Switch, FormControlLabel
} from '@mui/material';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';

class OutputConfigEditor extends Component {
    constructor(props) {
        super(props);
        this.state = {
            configs: [],
            loading: true,
            error: null,

            // Dialog state
            open: false,
            editingId: null,
            channel: '',
            description: '',
            value_type: 'boolean',
            min_value: 0,
            max_value: 1,
            device: '',
            device_channel: ''
        };
    }

    componentDidMount() {
        this.loadConfigs();
    }

    isAdmin() {
        const { user } = this.props;
        return user && user.role === 'admin';
    }

    loadConfigs = async () => {
        try {
            const res = await fetch('/api/output-configs');
            const configs = await res.json();
            this.setState({ configs, loading: false });
        } catch (err) {
            this.setState({ error: err.message, loading: false });
        }
    };

    handleOpenCreate = () => {
        this.setState({
            open: true,
            editingId: null,
            channel: '',
            description: '',
            value_type: 'boolean',
            min_value: 0,
            max_value: 1,
            device: '',
            device_channel: ''
        });
    };

    handleOpenEdit = (config, e) => {
        e.stopPropagation();
        this.setState({
            open: true,
            editingId: config.id,
            channel: config.channel,
            description: config.description || '',
            value_type: config.value_type,
            min_value: config.min_value,
            max_value: config.max_value,
            device: config.device || '',
            device_channel: config.device_channel || ''
        });
    };

    handleSave = async () => {
        const { editingId, channel, description, value_type, min_value, max_value, device, device_channel } = this.state;
        const { user } = this.props;

        if (!channel) {
            alert('Channel name is required');
            return;
        }

        const url = editingId ? `/api/output-configs/${editingId}` : '/api/output-configs';
        const method = editingId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({
                    channel,
                    description,
                    value_type,
                    min_value: parseFloat(min_value),
                    max_value: parseFloat(max_value),
                    device: device || null,
                    device_channel: device_channel || null
                })
            });

            if (res.ok) {
                this.setState({ open: false });
                this.loadConfigs();
            } else {
                const err = await res.json();
                alert('Failed: ' + err.error);
            }
        } catch (err) {
            alert('Failed: ' + err.message);
        }
    };

    handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Delete this output config?')) return;

        const { user } = this.props;
        try {
            await fetch(`/api/output-configs/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            this.loadConfigs();
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    };

    moveConfig = async (idx, dir) => {
        const newConfigs = [...this.state.configs];
        const target = idx + dir;
        if (target < 0 || target >= newConfigs.length) return;

        [newConfigs[idx], newConfigs[target]] = [newConfigs[target], newConfigs[idx]];
        this.setState({ configs: newConfigs });

        const order = newConfigs.map((c, i) => ({ id: c.id, position: i }));
        const { user } = this.props;

        try {
            await fetch('/api/output-configs/reorder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({ order })
            });
        } catch (err) {
            console.error('Failed to save order', err);
        }
    };

    render() {
        const { configs, loading, error, open, editingId, channel, description, value_type, min_value, max_value, device, device_channel } = this.state;
        const isAdmin = this.isAdmin();

        if (loading) return <Container sx={{ mt: 4 }}><Typography>Loading...</Typography></Container>;
        if (error) return <Container sx={{ mt: 4 }}><Typography color="error">{error}</Typography></Container>;

        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Paper sx={{ p: 2, mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h5">
                        <SettingsInputComponentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        Output Configuration
                    </Typography>
                    {isAdmin && (
                        <Button variant="contained" startIcon={<AddIcon />} onClick={this.handleOpenCreate}>
                            Add Output
                        </Button>
                    )}
                </Paper>

                <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>Output Channels</Typography>
                    <List>
                        {configs.map((config, idx) => (
                            <ListItem
                                key={config.id}
                                sx={{
                                    borderRadius: 1,
                                    mb: 1,
                                    border: '1px solid #504945',
                                    bgcolor: config.device ? 'rgba(131, 165, 152, 0.1)' : 'transparent'
                                }}
                            >
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                {config.channel}
                                            </Typography>
                                            <Chip
                                                size="small"
                                                label={config.value_type}
                                                color={config.value_type === 'boolean' ? 'default' : 'info'}
                                            />
                                            {config.device ? (
                                                <Chip
                                                    size="small"
                                                    icon={<LinkIcon />}
                                                    label={`${config.device}:${config.device_channel}`}
                                                    color="success"
                                                    variant="outlined"
                                                />
                                            ) : (
                                                <Chip
                                                    size="small"
                                                    icon={<LinkOffIcon />}
                                                    label="unbound"
                                                    color="warning"
                                                    variant="outlined"
                                                />
                                            )}
                                        </Box>
                                    }
                                    secondary={
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">
                                                {config.description || 'No description'}
                                            </Typography>
                                            {config.value_type === 'number' && (
                                                <Typography variant="body2" color="text.secondary">
                                                    Range: {config.min_value} - {config.max_value}
                                                </Typography>
                                            )}
                                        </Box>
                                    }
                                />
                                {isAdmin && (
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <IconButton size="small" onClick={() => this.moveConfig(idx, -1)} disabled={idx === 0}>
                                            <ArrowUpwardIcon />
                                        </IconButton>
                                        <IconButton size="small" onClick={() => this.moveConfig(idx, 1)} disabled={idx === configs.length - 1}>
                                            <ArrowDownwardIcon />
                                        </IconButton>
                                        <IconButton onClick={(e) => this.handleOpenEdit(config, e)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton color="error" onClick={(e) => this.handleDelete(config.id, e)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Box>
                                )}
                            </ListItem>
                        ))}
                        {configs.length === 0 && (
                            <Typography color="text.secondary" sx={{ p: 2 }}>
                                No output channels defined. {isAdmin ? 'Click "Add Output" to create one.' : ''}
                            </Typography>
                        )}
                    </List>
                </Paper>

                {/* Edit/Create Dialog */}
                <Dialog open={open} onClose={() => this.setState({ open: false })} maxWidth="sm" fullWidth>
                    <DialogTitle>{editingId ? 'Edit Output Config' : 'Add Output Config'}</DialogTitle>
                    <DialogContent>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                            <TextField
                                label="Channel Name"
                                value={channel}
                                onChange={e => this.setState({ channel: e.target.value })}
                                fullWidth
                                placeholder="e.g., CircFanLevel"
                            />
                            <TextField
                                label="Description"
                                value={description}
                                onChange={e => this.setState({ description: e.target.value })}
                                fullWidth
                                placeholder="e.g., Circulation Fan Level"
                            />
                            <FormControl fullWidth>
                                <InputLabel>Value Type</InputLabel>
                                <Select
                                    value={value_type}
                                    label="Value Type"
                                    onChange={e => {
                                        const newType = e.target.value;
                                        // Auto-select compatible device: number->ac, boolean->tapo
                                        const newDevice = device ? (newType === 'number' ? 'ac' : 'tapo') : '';
                                        this.setState({
                                            value_type: newType,
                                            min_value: 0,
                                            max_value: newType === 'boolean' ? 1 : 10,
                                            device: newDevice
                                        });
                                    }}
                                >
                                    <MenuItem value="boolean">Boolean (on/off)</MenuItem>
                                    <MenuItem value="number">Number (0-10 range)</MenuItem>
                                </Select>
                            </FormControl>
                            {value_type === 'number' && (
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <TextField
                                        label="Min Value"
                                        type="number"
                                        value={min_value}
                                        onChange={e => this.setState({ min_value: e.target.value })}
                                        sx={{ flex: 1 }}
                                    />
                                    <TextField
                                        label="Max Value"
                                        type="number"
                                        value={max_value}
                                        onChange={e => this.setState({ max_value: e.target.value })}
                                        sx={{ flex: 1 }}
                                    />
                                </Box>
                            )}

                            <Typography variant="subtitle2" sx={{ mt: 2 }}>Device Binding (Optional)</Typography>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <FormControl sx={{ flex: 1 }}>
                                    <InputLabel>Device</InputLabel>
                                    <Select
                                        value={device}
                                        label="Device"
                                        onChange={e => this.setState({ device: e.target.value })}
                                    >
                                        <MenuItem value=""><em>Not bound</em></MenuItem>
                                        {value_type === 'boolean' && <MenuItem value="tapo">tapo (Switch)</MenuItem>}
                                        {value_type === 'number' && <MenuItem value="ac">ac (Level)</MenuItem>}
                                    </Select>
                                </FormControl>
                                <TextField
                                    label="Device Channel"
                                    value={device_channel}
                                    onChange={e => this.setState({ device_channel: e.target.value })}
                                    sx={{ flex: 1 }}
                                    placeholder={value_type === 'number' ? 'e.g., tent:fan' : 'e.g., r0, c'}
                                    disabled={!device}
                                />
                            </Box>
                            {device && (
                                <Typography variant="caption" color="text.secondary">
                                    Binding type: {device === 'ac' ? 'Level (0-10)' : 'Switch (on/off)'}
                                </Typography>
                            )}
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => this.setState({ open: false })}>Cancel</Button>
                        <Button variant="contained" onClick={this.handleSave}>Save</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        );
    }
}

export default OutputConfigEditor;
