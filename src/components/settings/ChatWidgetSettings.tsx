import { useEffect, useState } from 'react';
import { Plus, Code, Trash2, Edit, Power, Globe, Palette, MessageSquare, Copy, Check } from 'lucide-react';
import { chatWidgetService, type ChatWidget } from '@/services/chatWidget.service';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ChatWidgetModal } from './modals/ChatWidgetModal';
import { EmbedCodeModal } from './modals/EmbedCodeModal';

export const ChatWidgetSettings = () => {
  const [widgets, setWidgets] = useState<ChatWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWidget, setEditingWidget] = useState<ChatWidget | null>(null);
  const [embedCodeWidget, setEmbedCodeWidget] = useState<ChatWidget | null>(null);
  const [deletingWidget, setDeletingWidget] = useState<ChatWidget | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'info' | 'warning' | 'error' | 'success';
  }>({
    open: false,
    title: '',
    description: '',
    variant: 'info',
  });

  useEffect(() => {
    fetchWidgets().catch(console.error);
  }, []);

  const fetchWidgets = async () => {
    try {
      const response = await chatWidgetService.getAll();
      if (response.success && response.data) {
        setWidgets(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch chat widgets:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to load chat widgets',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (widget: ChatWidget) => {
    try {
      await chatWidgetService.update(widget.id, { enabled: !widget.enabled });
      await fetchWidgets();
      setAlertDialog({
        open: true,
        title: 'Success',
        description: `Widget ${!widget.enabled ? 'enabled' : 'disabled'} successfully`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to toggle widget:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to update widget',
        variant: 'error',
      });
    }
  };

  const handleDeleteClick = (widget: ChatWidget) => {
    setDeletingWidget(widget);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingWidget) return;

    try {
      await chatWidgetService.delete(deletingWidget.id);
      await fetchWidgets();
      setAlertDialog({
        open: true,
        title: 'Success',
        description: 'Widget deleted successfully',
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to delete widget:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to delete widget',
        variant: 'error',
      });
    } finally {
      setDeletingWidget(null);
    }
  };

  const handleCopyKey = async (widget: ChatWidget) => {
    try {
      await navigator.clipboard.writeText(widget.widgetKey);
      setCopiedId(widget.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (loading) {
    return <div className="py-12 text-center">Loading chat widgets...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Chat Widgets</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Embeddable AI-powered chat widgets for your website
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Widget
        </Button>
      </div>

      {widgets.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No chat widgets yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first chat widget to embed on your website
          </p>
          <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Widget
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {widgets.map((widget) => (
            <Card key={widget.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{widget.name}</h3>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        widget.enabled
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {widget.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground capitalize">
                    {widget.departmentRole} • {widget.position.replace('-', ' ')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggle(widget)}
                  title={widget.enabled ? 'Disable' : 'Enable'}
                >
                  <Power
                    className={`h-4 w-4 ${widget.enabled ? 'text-green-600' : 'text-gray-400'}`}
                  />
                </Button>
              </div>

              <div className="mt-4 space-y-2">
                {widget.welcomeMessage && (
                  <div className="flex items-start gap-2 text-sm">
                    <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground line-clamp-2">
                      {widget.welcomeMessage}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Color:</span>
                  <div
                    className="h-4 w-4 rounded border"
                    style={{ backgroundColor: widget.primaryColor }}
                  />
                  <span className="font-mono text-xs">{widget.primaryColor}</span>
                </div>
                {widget.allowedDomains.length > 0 && (
                  <div className="flex items-start gap-2 text-sm">
                    <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {widget.allowedDomains.length} allowed domain(s)
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 rounded bg-muted p-2">
                <Code className="h-4 w-4 text-muted-foreground" />
                <code className="flex-1 truncate text-xs font-mono">{widget.widgetKey}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyKey(widget)}
                  title="Copy widget key"
                >
                  {copiedId === widget.id ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setEmbedCodeWidget(widget)}
                >
                  <Code className="mr-2 h-4 w-4" />
                  Embed Code
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingWidget(widget)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClick(widget)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ChatWidgetModal
        open={showCreateModal || !!editingWidget}
        widget={editingWidget}
        onClose={() => {
          setShowCreateModal(false);
          setEditingWidget(null);
        }}
        onSuccess={() => {
          setShowCreateModal(false);
          setEditingWidget(null);
          fetchWidgets().catch(console.error);
        }}
        onShowAlert={setAlertDialog}
      />

      <EmbedCodeModal
        widget={embedCodeWidget}
        onClose={() => setEmbedCodeWidget(null)}
      />

      <ConfirmDialog
        open={!!deletingWidget}
        onOpenChange={(open) => !open && setDeletingWidget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Chat Widget"
        description={`Delete widget "${deletingWidget?.name}"? This will also delete all associated sessions and messages.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      <AlertDialog
        open={alertDialog.open}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
      />
    </div>
  );
};
