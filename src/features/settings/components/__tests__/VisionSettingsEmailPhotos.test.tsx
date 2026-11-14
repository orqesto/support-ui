/**
 * support-service#1489: Settings › AI › Image analysis carries the two email-photo settings
 * (photos read per email, smallest image read), shows the stored values, refuses an out-of-range
 * value before it is sent, and stays as it was on a backend from before the settings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VisionSettings } from '../VisionSettings';

const limits = {
  maxImagesPerMessage: { default: 3, min: 1, max: 10 },
  minImageKb: { default: 20, min: 0, max: 5000 },
};
let config: Record<string, unknown>;
let configFails = false;
const updateVisionConfig = vi.fn<(data: Record<string, unknown>) => Promise<unknown>>();
const getProviders = vi.fn(() => Promise.resolve({ data: { enabled: [] as string[] } }));

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getVisionConfig: () =>
      configFails ? Promise.reject(new Error('network')) : Promise.resolve(config),
    updateVisionConfig: (data: Record<string, unknown>) => updateVisionConfig(data),
  },
}));
vi.mock('@/services/ai.service', () => ({
  aiService: {
    getProviders: () => getProviders(),
    getModels: () => Promise.resolve({ data: { chat: [] } }),
  },
}));

const photosField = () => screen.getByLabelText<HTMLInputElement>('Photos read per email');
const sizeField = () => screen.getByLabelText<HTMLInputElement>('Smallest image read (KB)');
const saveButton = () => screen.getByRole('button', { name: 'Save' });

describe('VisionSettings: email photo settings', () => {
  beforeEach(() => {
    config = { enabled: true, emailPhotos: true, maxImagesPerMessage: 5, minImageKb: 40, limits };
    updateVisionConfig.mockReset().mockResolvedValue({ success: true });
    getProviders.mockClear();
    configFails = false;
  });
  afterEach(cleanup);

  it('shows the stored values and saves the edited ones with the rest of the settings', async () => {
    render(<VisionSettings />);
    await waitFor(() => expect(photosField().value).toBe('5'));
    expect(sizeField().value).toBe('40');

    fireEvent.change(photosField(), { target: { value: '2' } });
    fireEvent.change(sizeField(), { target: { value: '0' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateVisionConfig).toHaveBeenCalledTimes(1));
    expect(updateVisionConfig).toHaveBeenCalledWith({
      enabled: true,
      provider: null,
      model: null,
      emailPhotos: true,
      maxImagesPerMessage: 2,
      minImageKb: 0,
    });
  });

  it('refuses an out-of-range or fractional value: error shown, Save off, nothing sent', async () => {
    render(<VisionSettings />);
    await waitFor(() => expect(photosField().value).toBe('5'));

    fireEvent.change(photosField(), { target: { value: '11' } });
    expect(screen.getByText('A whole number from 1 to 10')).toBeTruthy();
    expect(saveButton().getAttribute('aria-disabled')).toBe('true');

    fireEvent.change(photosField(), { target: { value: '2.5' } });
    expect(saveButton().getAttribute('aria-disabled')).toBe('true');
    // A click on the inactive button sends nothing.
    fireEvent.click(saveButton());

    // CONTROL: a valid value turns Save back on.
    fireEvent.change(photosField(), { target: { value: '10' } });
    expect(saveButton().getAttribute('aria-disabled')).not.toBe('true');
    expect(updateVisionConfig).not.toHaveBeenCalled();
  });

  it('a backend from before the settings: no email-photo fields, and none are sent', async () => {
    config = { enabled: true };
    render(<VisionSettings />);
    await waitFor(() => expect(saveButton()).toBeTruthy());
    expect(screen.queryByLabelText('Photos read per email')).toBeNull();

    fireEvent.click(saveButton());
    await waitFor(() => expect(updateVisionConfig).toHaveBeenCalledTimes(1));
    expect(updateVisionConfig.mock.calls[0][0]).toEqual({
      enabled: true,
      provider: null,
      model: null,
    });
  });

  it('image analysis off: the fields are hidden and cannot block the save', async () => {
    config = { enabled: false, emailPhotos: true, maxImagesPerMessage: 3, minImageKb: 20, limits };
    render(<VisionSettings />);
    await waitFor(() => expect(saveButton()).toBeTruthy());
    expect(screen.queryByLabelText('Photos read per email')).toBeNull();
    expect(saveButton().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('email photos OFF (the default): switch shown off, number fields hidden; switching on shows them and saves it', async () => {
    config = { enabled: true, emailPhotos: false, maxImagesPerMessage: 3, minImageKb: 20, limits };
    render(<VisionSettings />);
    const toggle = await screen.findByRole('switch', { name: 'Read photos in customer emails' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByLabelText('Photos read per email')).toBeNull();

    fireEvent.click(toggle);
    expect(photosField().value).toBe('3');
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateVisionConfig).toHaveBeenCalledTimes(1));
    expect(updateVisionConfig.mock.calls[0][0]).toMatchObject({
      emailPhotos: true,
      maxImagesPerMessage: 3,
    });
  });

  it('switching email photos off saves emailPhotos: false', async () => {
    render(<VisionSettings />);
    const toggle = await screen.findByRole('switch', { name: 'Read photos in customer emails' });
    fireEvent.click(toggle);
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateVisionConfig).toHaveBeenCalledTimes(1));
    expect(updateVisionConfig.mock.calls[0][0]).toMatchObject({ emailPhotos: false });
  });

  it('managed AI: the switches show, the model picker does not, and a save leaves the stored model alone', async () => {
    config = {
      enabled: true,
      emailPhotos: false,
      model: 'gpt-4o',
      maxImagesPerMessage: 3,
      minImageKb: 20,
      limits,
    };
    render(<VisionSettings managed />);
    const toggle = await screen.findByRole('switch', { name: 'Read photos in customer emails' });
    expect(screen.queryByText('Vision model (your own AI keys)')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateVisionConfig).toHaveBeenCalledTimes(1));
    const sent = updateVisionConfig.mock.calls[0][0];
    expect(sent).toMatchObject({ enabled: true, emailPhotos: true });
    expect(sent).not.toHaveProperty('model');
    expect(sent).not.toHaveProperty('provider');
  });

  it('CONTROL — own keys: the model picker shows and the save carries the model fields', async () => {
    render(<VisionSettings />);
    await screen.findByRole('switch', { name: 'Read photos in customer emails' });
    expect(screen.getByText('Vision model (your own AI keys)')).toBeTruthy();
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateVisionConfig).toHaveBeenCalledTimes(1));
    expect(updateVisionConfig.mock.calls[0][0]).toHaveProperty('model', null);
  });

  it('an old backend (no email-photo fields): the new switch is absent too, not only its fields', async () => {
    config = { enabled: true };
    render(<VisionSettings />);
    await screen.findByRole('button', { name: 'Save' });
    expect(screen.queryByRole('switch', { name: 'Read photos in customer emails' })).toBeNull();
  });

  it('managed AI on an old backend: the whole card stays hidden (FE can reach prod first)', async () => {
    config = { enabled: true };
    const { container } = render(<VisionSettings managed />);
    await waitFor(() => expect(container.textContent).toBe(''));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('managed AI does not list own-keys providers or models (no picker to fill)', async () => {
    render(<VisionSettings managed />);
    await screen.findByRole('switch', { name: 'Read photos in customer emails' });
    expect(getProviders).not.toHaveBeenCalled();
  });

  it('CONTROL — own keys still list them', async () => {
    render(<VisionSettings />);
    await screen.findByRole('switch', { name: 'Read photos in customer emails' });
    expect(getProviders).toHaveBeenCalledTimes(1);
  });

  it('a failed load shows an error and no Save (defaults are never written back)', async () => {
    configFails = true;
    render(<VisionSettings />);
    expect(await screen.findByText(/Image analysis settings could not be loaded/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('an invalid number, then email photos switched off: Save works and sends no number fields', async () => {
    render(<VisionSettings />);
    const toggle = await screen.findByRole('switch', { name: 'Read photos in customer emails' });
    fireEvent.change(photosField(), { target: { value: 'abc' } });
    expect(saveButton().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(toggle);
    expect(saveButton().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateVisionConfig).toHaveBeenCalledTimes(1));
    const sent = updateVisionConfig.mock.calls[0][0];
    expect(sent).toMatchObject({ emailPhotos: false });
    expect(sent).not.toHaveProperty('maxImagesPerMessage');
  });

  it('the master switch has an accessible name', async () => {
    render(<VisionSettings />);
    expect(await screen.findByRole('switch', { name: 'Image analysis' })).toBeTruthy();
  });
});
