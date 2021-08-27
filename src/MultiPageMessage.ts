import {
  TextBasedChannels,
  EmbedField,
  MessageEmbed,
  MessageActionRow,
  MessageButton,
  MessageSelectMenu,
  MessageOptions,
} from "discord.js";
import { v1 as uuid } from "uuid";

export class MultiPageMessageOfFieldsOptions {
  channel: TextBasedChannels;
  title: string;
  description: string;
  fields: EmbedField[];
  withSelectMenu?: boolean = true;
  fieldToUseForSelectValue?: "name" | "value" = "value";
  maxSelectValueOfOne?: boolean = true;
  url?: string = undefined;
  selectPlaceholder: string = "Select one option from above";

  constructor(init?: Partial<MultiPageMessageOfFieldsOptions>) {
    Object.assign(this, init);
  }
}

export default class MultiPageMessage {
  static createMultipageMessageOfFields(
    options: MultiPageMessageOfFieldsOptions
  ): MessageOptions {
    const chunks: EmbedField[][] = [[]];

    let currentChunkIndex = 0;
    for (const field of options.fields) {
      if (
        chunks[currentChunkIndex].length >= 18 ||
        chunks[currentChunkIndex].reduce(
          (acc, curr) => acc + curr.name.length + curr.value.length,
          0
        ) +
          options.title.length +
          options.description.length >=
          5980
      ) {
        currentChunkIndex++;
        chunks.push([]);
      }
      chunks[currentChunkIndex].push(field);
    }
    const uid = uuid();

    const createMessage = (page: number): MessageOptions => {
      const pageChunk = chunks[page - 1];
      const embed = {
        title: options.title,
        url: options.url,
        description: options.description,
        fields:
          pageChunk.length > 0
            ? pageChunk
            : [
                {
                  name: "No options available",
                  value: "\u200b",
                },
              ],
        footer:
          chunks.length > 1
            ? { text: `Page ${page} of ${chunks.length}` }
            : null,
      } as MessageEmbed;

      const messageOptions = {
        embeds: [embed],
      } as MessageOptions;

      messageOptions.components = [];

      if (chunks.length > 1) {
        const row = new MessageActionRow();

        for (
          let i = Math.max(page - 2, 1);
          i <= Math.min(Math.max(page - 2, 1) + 4, chunks.length);
          i++
        ) {
          row.addComponents([
            new MessageButton()
              .setCustomId(`${i}#${uid}`)
              .setLabel(`Page ${i}`)
              .setStyle("SECONDARY")
              .setDisabled(i === page),
          ]);
        }

        const row2 = new MessageActionRow().addComponents([
          new MessageButton()
            .setCustomId(`start#${uid}`)
            .setLabel("↩️ Jump to start (1)")
            .setStyle("SECONDARY")
            .setDisabled(page === 1),
          new MessageButton()
            .setCustomId(`middle#${uid}`)
            .setLabel(`Jump to mid (${Math.ceil(chunks.length / 2)})`)
            .setStyle("SECONDARY")
            .setDisabled(page === Math.ceil(chunks.length / 2)),
          new MessageButton()
            .setCustomId(`end#${uid}`)
            .setLabel(`Jump to end (${chunks.length}) ↪️`)
            .setStyle("SECONDARY")
            .setDisabled(page === chunks.length),
        ]);

        messageOptions.components.push(row, row2);
      }

      if (options.withSelectMenu && pageChunk.length > 0) {
        const row = new MessageActionRow().addComponents([
          new MessageSelectMenu()
            .setCustomId(`select#${uid}`)
            .setMaxValues(options.maxSelectValueOfOne ? 1 : pageChunk.length)
            .setPlaceholder(options.selectPlaceholder)
            .addOptions(
              pageChunk.map((f) => ({
                label: f.name,
                value:
                  options.fieldToUseForSelectValue === "value"
                    ? f.value
                    : f.name,
              }))
            ),
        ]);
        messageOptions.components.push(row);
      }

      return messageOptions;
    };

    const pageRegex = /^[^\d]*(\d+).*$/;

    const buttonCollector = options.channel.createMessageComponentCollector({
      componentType: "BUTTON",
      filter: (m) => m.customId.endsWith(`#${uid}`),
      time: 600000,
    });
    buttonCollector.on("collect", (component) => {
      component.deferUpdate();
      const buttonId = component.customId.split("#")[0];

      options.channel.messages.fetch(component.message.id).then((message) => {
        message.suppressEmbeds(false).catch();
        switch (buttonId) {
          case "start":
            {
              message.edit(createMessage(1));
            }
            break;
          case "middle":
            {
              message.edit(createMessage(Math.ceil(chunks.length / 2)));
            }
            break;
          case "end":
            {
              message.edit(createMessage(chunks.length));
            }
            break;
          default: {
            const nextPage = parseInt(buttonId);
            if (isNaN(nextPage) || nextPage < 1 || nextPage > chunks.length) {
              return;
            }

            message.edit(createMessage(nextPage));
          }
        }
      });
    });

    return createMessage(1);
  }
}
