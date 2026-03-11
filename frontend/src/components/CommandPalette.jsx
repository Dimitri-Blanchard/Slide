import React, { useState, useEffect, useLayoutEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { Ban, CheckCircle, LogOut, AlertTriangle, Megaphone, ArrowUp, ArrowDown, Lock, Unlock, BarChart3, HelpCircle, Shield, MessageSquare, Users, Settings, Info, ChevronRight } from 'lucide-react';

// Admin commands with descriptions and usage (no emojis)
const ADMIN_COMMANDS = [
  { command: 'ban', Icon: Ban, label: '/ban @user [raison]', description: 'Bannir un utilisateur du site', category: 'moderation' },
  { command: 'unban', Icon: CheckCircle, label: '/unban @user', description: 'Débannir un utilisateur', category: 'moderation' },
  { command: 'kick', Icon: LogOut, label: '/kick @user', description: 'Expulser un utilisateur de l\'équipe actuelle', category: 'moderation' },
  { command: 'warn', Icon: AlertTriangle, label: '/warn @user message', description: 'Envoyer un avertissement privé', category: 'moderation' },
  { command: 'announce', Icon: Megaphone, label: '/announce message', description: 'Envoyer une annonce globale à tous les utilisateurs', category: 'communication' },
  { command: 'promote', Icon: ArrowUp, label: '/promote @user', description: 'Promouvoir un utilisateur en administrateur', category: 'roles' },
  { command: 'demote', Icon: ArrowDown, label: '/demote @user', description: 'Rétrograder un administrateur en utilisateur', category: 'roles' },
  { command: 'lock', Icon: Lock, label: '/lock [minutes] [raison]', description: 'Verrouiller le site (maintenance)', category: 'system' },
  { command: 'unlock', Icon: Unlock, label: '/unlock', description: 'Déverrouiller le site', category: 'system' },
  { command: 'status', Icon: BarChart3, label: '/status', description: 'Voir l\'état actuel du site', category: 'system' },
  { command: 'help', Icon: HelpCircle, label: '/help', description: 'Afficher la liste des commandes', category: 'info' }
];

const CATEGORY_LABELS = {
  moderation: { label: 'Modération', Icon: Shield },
  communication: { label: 'Communication', Icon: MessageSquare },
  roles: { label: 'Rôles', Icon: Users },
  system: { label: 'Système', Icon: Settings },
  info: { label: 'Information', Icon: Info },
  suggested: { label: 'Suggested', Icon: ChevronRight },
};

const RECENT_COMMANDS_KEY = 'slide_recent_commands';

const CommandPalette = memo(function CommandPalette({ 
  query = '', 
  onSelect, 
  onClose,
  inputRef 
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ bottom: 0, left: 0, width: 280 });
  const [recentCommands, setRecentCommands] = useState([]);
  const paletteRef = useRef(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) || '[]');
      if (Array.isArray(stored)) setRecentCommands(stored.slice(0, 5));
    } catch (_) {}
  }, []);

  const recordRecentCommand = (command) => {
    setRecentCommands((prev) => {
      const next = [command, ...prev.filter((c) => c !== command)].slice(0, 5);
      try {
        localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  };

  const handleSelectCommand = (command) => {
    if (!command) return;
    recordRecentCommand(command);
    onSelect(`/${command} `);
  };

  // Position above input via portal — escapes parent overflow:hidden
  useLayoutEffect(() => {
    if (!inputRef?.current) return;
    const updatePosition = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const containerRect = el.closest('.message-input-container')?.getBoundingClientRect();
      const width = containerRect ? Math.min(containerRect.width - 32, 400) : 280;
      const left = containerRect ? containerRect.left + 16 : rect.left;
      const bottom = window.innerHeight - rect.top + 8;
      setPosition({ bottom, left, width });
    };
    updatePosition();
    const ro = new ResizeObserver(updatePosition);
    ro.observe(inputRef.current);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [inputRef]);

  // Filter commands based on query
  const filteredCommands = ADMIN_COMMANDS.filter(cmd => {
    const searchQuery = query.toLowerCase().replace('/', '');
    return cmd.command.includes(searchQuery) || 
           cmd.description.toLowerCase().includes(searchQuery) ||
           cmd.label.toLowerCase().includes(searchQuery);
  });

  const showSuggestions = query.trim().length === 0;
  const suggestedCommands = showSuggestions
    ? recentCommands
        .map((command) => ADMIN_COMMANDS.find((cmd) => cmd.command === command))
        .filter(Boolean)
    : [];
  const filteredWithoutSuggestions = showSuggestions
    ? filteredCommands.filter((cmd) => !suggestedCommands.some((s) => s.command === cmd.command))
    : filteredCommands;

  // Group commands by category
  const groupedCommands = filteredWithoutSuggestions.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  // Flatten for keyboard navigation
  const flatCommands = showSuggestions
    ? [...suggestedCommands, ...filteredWithoutSuggestions]
    : filteredCommands;

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (flatCommands.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < flatCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : flatCommands.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (flatCommands[selectedIndex]) {
            handleSelectCommand(flatCommands[selectedIndex].command);
          }
          break;
        case 'Tab':
          e.preventDefault();
          if (flatCommands[selectedIndex]) {
            handleSelectCommand(flatCommands[selectedIndex].command);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flatCommands, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = paletteRef.current?.querySelector('.command-item.selected');
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Click outside to close (but not when clicking the input)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!paletteRef.current?.contains(e.target) && !inputRef?.current?.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, inputRef]);

  const paletteStyle = {
    position: 'fixed',
    bottom: position.bottom,
    left: position.left,
    width: position.width,
    maxHeight: 380,
    zIndex: 10000
  };

  let globalIndex = 0;

  const paletteContent = flatCommands.length === 0 ? (
    <div className="command-palette" ref={paletteRef} style={paletteStyle}>
      <div className="command-palette-header">
        <span className="command-palette-icon"><HelpCircle size={16} /></span>
        <span className="command-palette-title">Commandes Admin</span>
      </div>
      <div className="command-empty">
        <span className="command-empty-icon"><HelpCircle size={24} /></span>
        <span>Aucune commande trouvée</span>
      </div>
    </div>
  ) : (
    <div className="command-palette" ref={paletteRef} style={paletteStyle}>
      <div className="command-palette-header">
        <span className="command-palette-icon"><HelpCircle size={16} /></span>
        <span className="command-palette-title">Commandes Admin</span>
        <span className="command-palette-hint">
          <kbd>↑</kbd><kbd>↓</kbd> naviguer • <kbd>Tab</kbd> / <kbd>Enter</kbd> sélectionner
        </span>
      </div>
      <div className="command-list">
        {suggestedCommands.length > 0 && (
          <div className="command-category">
            <div className="command-category-header command-category-header-suggested">
              <span className="command-category-icon"><ChevronRight size={12} /></span>
              <span className="command-category-label">{CATEGORY_LABELS.suggested.label}</span>
            </div>
            {suggestedCommands.map((cmd) => {
              const currentIndex = globalIndex++;
              const isSelected = currentIndex === selectedIndex;
              const CmdIcon = cmd.Icon;
              return (
                <div
                  key={`suggested-${cmd.command}`}
                  className={`command-item ${isSelected ? 'selected' : ''} command-item-suggested`}
                  onClick={() => handleSelectCommand(cmd.command)}
                  onMouseEnter={() => setSelectedIndex(currentIndex)}
                >
                  <span className="command-icon">{CmdIcon && <CmdIcon size={18} />}</span>
                  <div className="command-content">
                    <span className="command-label">{cmd.label}</span>
                    <span className="command-description">{cmd.description}</span>
                  </div>
                  {isSelected && (
                    <span className="command-arrow"><ChevronRight size={16} /></span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {Object.entries(groupedCommands).map(([category, commands]) => {
          const CatIcon = CATEGORY_LABELS[category]?.Icon;
          return (
          <div key={category} className="command-category">
            <div className="command-category-header">
              <span className="command-category-icon">
                {CatIcon && <CatIcon size={12} />}
              </span>
              <span className="command-category-label">
                {CATEGORY_LABELS[category]?.label}
              </span>
            </div>
            {commands.map((cmd) => {
              const currentIndex = globalIndex++;
              const isSelected = currentIndex === selectedIndex;
              const CmdIcon = cmd.Icon;
              return (
                <div
                  key={cmd.command}
                  className={`command-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectCommand(cmd.command)}
                  onMouseEnter={() => setSelectedIndex(currentIndex)}
                >
                  <span className="command-icon">{CmdIcon && <CmdIcon size={18} />}</span>
                  <div className="command-content">
                    <span className="command-label">{cmd.label}</span>
                    <span className="command-description">{cmd.description}</span>
                  </div>
                  {isSelected && (
                    <span className="command-arrow"><ChevronRight size={16} /></span>
                  )}
                </div>
              );
            })}
          </div>
        );
        })}
      </div>
    </div>
  );

  return createPortal(paletteContent, document.body);
});

export default CommandPalette;
