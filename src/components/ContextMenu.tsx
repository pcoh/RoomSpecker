import React from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  items: {
    label: string;
    onClick: () => void;
  }[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-menu')) {
        onClose();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  return (
    <div
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px] context-menu"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default ContextMenu;