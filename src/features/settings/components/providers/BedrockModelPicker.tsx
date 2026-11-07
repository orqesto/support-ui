import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useBedrockModels } from '@/hooks/useBedrockModels';
import { bedrockModelSourceLabel, toPickerModels } from '@/services/bedrockDiscovery.service';
import type { AIModel } from '@/types/aiProviders';
import { BEDROCK_MODELS } from '@/types/aiProviders';

/** The "Other" row: switches the picker to a text field for any model id. */
const OTHER_MODEL = '__other__';

type Props = {
  /** The form's region; discovery runs for it. */
  region: string;
  value: string;
  onChange: (modelId: string) => void;
};

/**
 * The Bedrock models to offer for a region — live from AWS when discovery answers, the static
 * catalog otherwise — and the line saying which and why. `region` undefined = static only.
 */
export const useBedrockModelOptions = (region: string | undefined) => {
  const discovery = useBedrockModels(region === '' ? undefined : region);
  const liveModels = toPickerModels(discovery.data?.payload?.models ?? []);
  const options: AIModel[] = liveModels.length > 0 ? liveModels : BEDROCK_MODELS;
  const sourceLabel = bedrockModelSourceLabel(
    discovery,
    'save this connection to load the models your AWS account can use.'
  );
  return { options, sourceLabel, isLoading: discovery.isLoading };
};

/**
 * The Bedrock card's default-model picker.
 *
 * Live model discovery runs for the region in the form. It falls back to the static BEDROCK_MODELS
 * catalog when discovery returns nothing, and the line under it says why (not saved yet, IAM
 * denial, AWS hiccup). "Other" takes any model id — a model AWS lists that the catalog does not,
 * or one the identity cannot list — and a stored id missing from the options opens as text, so it
 * is never hidden behind an empty dropdown.
 */
export const BedrockModelPicker = ({ region, value, onChange }: Props) => {
  const { options: modelOptions, sourceLabel, isLoading } = useBedrockModelOptions(region);

  // Once the text field is showing it stays until "Pick from the list instead": clearing it to type
  // a new id, or typing one that happens to be listed, must not swap the field out mid-edit.
  const [customModel, setCustomModel] = useState(false);
  const known = modelOptions.some((model) => model.id === value);
  const typing = customModel || (!!value && !known && !isLoading);
  const textRef = useRef<HTMLInputElement>(null);
  const [focusText, setFocusText] = useState(false);
  useEffect(() => {
    // "Other" unmounts the focused dropdown; hand focus to the field that replaced it.
    if (focusText && typing) {
      textRef.current?.focus();
      setFocusText(false);
    }
  }, [focusText, typing]);

  return (
    <div>
      {typing ? (
        <>
          <Input
            ref={textRef}
            label="Default Model *"
            value={value}
            onChange={(event) => {
              setCustomModel(true);
              onChange(event.target.value);
            }}
            placeholder="e.g. eu.anthropic.claude-… or an inference profile ARN"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 px-2"
            onClick={() => {
              setCustomModel(false);
              onChange('');
            }}
          >
            Pick from the list instead
          </Button>
        </>
      ) : (
        <Select
          label="Default Model *"
          value={value}
          onChange={(next) => {
            if (next === OTHER_MODEL) {
              setCustomModel(true);
              setFocusText(true);
              onChange('');
              return;
            }
            onChange(next);
          }}
          options={[
            ...modelOptions.map((model) => ({ value: model.id, label: model.name })),
            { value: OTHER_MODEL, label: 'Other (type a model id)…' },
          ]}
        />
      )}
      <p className="mt-1 text-xs text-muted-foreground">{sourceLabel}</p>
    </div>
  );
};
