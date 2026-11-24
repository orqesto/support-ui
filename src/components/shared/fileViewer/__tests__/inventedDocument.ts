/** An invented, non-repeating Markdown document of about `length` characters. */
export const inventedDocument = (length: number): string => {
  const parts: string[] = [];
  let size = 0;
  for (let section = 1; size < length; section++) {
    const block = [
      `## Section ${section}: delivery zone ${section * 7}`,
      '',
      `Parcels for zone ${section * 7} leave the warehouse on day ${section % 5} and arrive within ${section + 2} working days.`,
      `Returns for order group ${section * 13} are accepted for ${section + 30} days after delivery.`,
      '',
      `- Carrier option ${section}a costs ${section}.50 EUR`,
      `- Carrier option ${section}b costs ${section + 1}.25 EUR`,
      '',
      `| Item ${section} | Weight | Price |`,
      '| --- | --- | --- |',
      `| Box ${section} | ${section * 3} kg | ${section * 11} EUR |`,
      '',
    ].join('\n');
    parts.push(block);
    size += block.length + 1;
  }
  return parts.join('\n');
};
