import { useState } from 'react';
import { Mail, Eye, RefreshCw, AlertCircle } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';

type TemplateType = 'invitation' | 'verification' | 'auto_reply' | 'password_reset';

type Template = {
  type: TemplateType;
  name: string;
  description: string;
};

const TEMPLATES: Template[] = [
  {
    type: 'invitation',
    name: 'User Invitation',
    description: 'Email sent when admins invite new users to join an organization',
  },
  {
    type: 'verification',
    name: 'Email Verification',
    description: 'Email sent to verify user email addresses after registration',
  },
  {
    type: 'password_reset',
    name: 'Password Reset',
    description: 'Email sent when users request to reset their password',
  },
  {
    type: 'auto_reply',
    name: 'Auto Reply',
    description: 'Automated response sent when AI needs more information from customers',
  },
];

export const EmailTemplatesPage = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = async (templateType: TemplateType) => {
    setIsLoadingPreview(true);
    setError(null);
    try {
      const response = await apiClient.get<string>(`/api/email-templates/${templateType}/render`, {
        responseType: 'text',
      });
      setPreviewHtml(response.data);
      setSelectedTemplate(templateType);
    } catch (error) {
      console.error('Error loading template preview:', error);
      setError('Failed to load template preview. Please make sure you are logged in as an admin.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const refreshPreview = async () => {
    if (selectedTemplate) {
      await loadPreview(selectedTemplate);
    }
  };

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-6 w-full max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h2 className="flex gap-2 items-center text-2xl font-bold">
              <Mail className="w-7 h-7" />
              Email Templates
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Preview and customize email templates (Admin only)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Template List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Available Templates</CardTitle>
                <CardDescription>Select a template to preview</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {TEMPLATES.map((template) => (
                    <Button
                      key={template.type}
                      variant="ghost"
                      onClick={() => loadPreview(template.type)}
                      className={`h-auto rounded-none justify-start w-full text-left p-4 hover:bg-accent transition-colors ${
                        selectedTemplate === template.type
                          ? 'bg-blue-500/10 dark:bg-blue-500/10 border-l-4 border-primary'
                          : ''
                      }`}
                    >
                      <div className="flex gap-3 items-start">
                        <Mail
                          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                            selectedTemplate === template.type
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium">{template.name}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {template.description}
                          </p>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {selectedTemplate && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-sm">Template Variables</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs">
                    <p className="text-muted-foreground">
                      Available variables for {selectedTemplate}:
                    </p>
                    <div className="p-3 space-y-1 font-mono text-xs rounded bg-muted">
                      <div>
                        <span className="text-primary">{'{{appName}}'}</span> - Application name
                      </div>
                      <div>
                        <span className="text-primary">{'{{year}}'}</span> - Current year
                      </div>
                      {selectedTemplate === 'invitation' && (
                        <>
                          <div>
                            <span className="text-primary">{'{{organizationName}}'}</span> -
                            Organization
                          </div>
                          <div>
                            <span className="text-primary">{'{{role}}'}</span> - User role
                          </div>
                          <div>
                            <span className="text-primary">{'{{signupUrl}}'}</span> - Signup link
                          </div>
                        </>
                      )}
                      {selectedTemplate === 'verification' && (
                        <>
                          <div>
                            <span className="text-primary">{'{{verificationUrl}}'}</span> -
                            Verification link
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Preview Area */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="flex gap-2 items-center">
                      <Eye className="w-5 h-5" />
                      Preview
                    </CardTitle>
                    <CardDescription>
                      {selectedTemplate
                        ? `Preview of ${TEMPLATES.find((t) => t.type === selectedTemplate)?.name}`
                        : 'Select a template to preview'}
                    </CardDescription>
                  </div>
                  {selectedTemplate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={refreshPreview}
                      disabled={isLoadingPreview}
                    >
                      <RefreshCw
                        className={`w-4 h-4 mr-2 ${isLoadingPreview ? 'animate-spin' : ''}`}
                      />
                      Refresh
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedTemplate && (
                  <div className="py-12 text-center text-gray-500">
                    <Mail className="mx-auto mb-4 w-16 h-16 text-gray-300" />
                    <p>Select a template from the list to preview it</p>
                  </div>
                )}

                {isLoadingPreview && (
                  <div className="py-12 text-center">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary" />
                    <p className="text-gray-500">Loading preview...</p>
                  </div>
                )}

                {error && (
                  <div className="flex gap-3 items-start p-4 bg-red-50 rounded-lg border border-red-200">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-red-900">Error</h4>
                      <p className="mt-1 text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                )}

                {selectedTemplate && !isLoadingPreview && !error && previewHtml && (
                  <div className="overflow-hidden rounded-lg border">
                    <div className="px-4 py-2 text-xs text-gray-600 bg-gray-100 border-b">
                      Preview with sample data
                    </div>
                    <iframe
                      srcDoc={previewHtml}
                      title="Email Preview"
                      className="w-full h-[600px] bg-white"
                      sandbox="allow-same-origin"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};
