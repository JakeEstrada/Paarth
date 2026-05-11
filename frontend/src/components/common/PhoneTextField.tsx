import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';
import { formatNanpTyping } from '../../utils/phoneFormat';

export type PhoneTextFieldProps = Omit<TextFieldProps, 'onChange' | 'type'> & {
  onChange?: TextFieldProps['onChange'];
};

/**
 * Single US-style phone line: accepts typed/pasted digits; stores/displays `(949)939-3802`.
 * Forwards other TextField props.
 */
export default function PhoneTextField({ onChange, inputProps, InputProps, ...rest }: PhoneTextFieldProps) {
  return (
    <TextField
      {...rest}
      type="text"
      onChange={(e) => {
        const next = formatNanpTyping(e.target.value);
        onChange?.({ ...e, target: { ...e.target, value: next } });
      }}
      InputProps={InputProps}
      inputProps={{
        inputMode: 'tel',
        maxLength: 14,
        autoComplete: 'tel',
        ...inputProps,
      }}
    />
  );
}
