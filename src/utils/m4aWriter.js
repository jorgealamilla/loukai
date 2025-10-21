import fs from 'fs';

/**
 * M4AWriter - Write kaid atom to M4A Stems files
 *
 * Strategy: Parse MP4 structure and inject custom ----:com.stems:kaid atom
 * directly into the moov > udta > meta > ilst hierarchy.
 */
class M4AWriter {
  /**
   * Save updated kaid data to M4A file
   * @param {Object} songData - Updated song data with kaid information
   * @param {string} outputPath - Path to save the updated M4A file
   * @returns {Promise<Object>} Result with success status
   */
  static async save(songData, outputPath) {
    try {
      console.log('💾 Saving M4A file:', outputPath);
      console.log('💾 Song data keys:', Object.keys(songData));
      console.log('💾 Lyrics array:', songData.lyrics);

      // Prepare kaid JSON data
      const kaidData = this.prepareKaidData(songData);
      const kaidJson = JSON.stringify(kaidData);

      console.log('📝 kaid data prepared:', {
        lyricsCount: kaidData.lines?.length || 0,
        audioSources: kaidData.audio?.sources?.length || 0,
        kaidJsonLength: kaidJson.length,
      });
      console.log('📝 First 500 chars of kaid JSON:', kaidJson.substring(0, 500));

      // Inject kaid atom directly into the M4A file
      await this.injectKaidAtom(outputPath, outputPath, kaidJson);

      console.log('✅ M4A file saved successfully');

      // Verify the atom was written
      console.log('🔍 Verifying kaid atom was written...');
      const verification = await this.validate(outputPath);
      if (!verification) {
        console.error('⚠️  WARNING: Save completed but kaid atom NOT found in file!');
      } else {
        console.log('✅ Verification passed: kaid atom found in file');
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Failed to save M4A file:', error);
      console.error('❌ Stack trace:', error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Inject kaid atom into M4A file
   * Parses MP4 structure and injects custom ----:com.stems:kaid atom
   */
  static async injectKaidAtom(inputPath, outputPath, kaidJson) {
    try {
      // Read the entire file
      const fileBuffer = await fs.promises.readFile(inputPath);

      console.log('🔍 Parsing MP4 structure...');

      // Parse MP4 atoms
      const atoms = this.parseMP4Atoms(fileBuffer);

      // Find moov atom
      const moovAtom = atoms.find((a) => a.type === 'moov');
      if (!moovAtom) {
        throw new Error('No moov atom found in M4A file');
      }

      console.log('📦 Found moov atom at offset', moovAtom.offset);

      // Create the kaid atom data
      const kaidAtomData = this.createKaidAtom(kaidJson);

      console.log(`📝 Created kaid atom (${kaidAtomData.length} bytes)`);

      // Find or create udta atom inside moov
      const moovChildren = this.parseMP4Atoms(fileBuffer, moovAtom.dataOffset, moovAtom.size - 8);
      const udtaAtom = moovChildren.find((a) => a.type === 'udta');

      let newMoovData;

      if (!udtaAtom) {
        console.log('📦 Creating new udta atom...');
        // Create new udta atom with meta > ilst > kaid
        const metaIlstKaid = this.createMetaIlstKaidStructure(kaidAtomData);
        const udtaData = this.createAtom('udta', metaIlstKaid);

        // Insert udta at end of moov children
        const moovDataEnd = moovAtom.dataOffset + moovAtom.size - 8;
        const beforeUdta = fileBuffer.slice(moovAtom.dataOffset, moovDataEnd);

        newMoovData = Buffer.concat([beforeUdta, udtaData]);
      } else {
        console.log('📦 Found existing udta atom, updating...');
        // Parse udta children
        const udtaChildren = this.parseMP4Atoms(fileBuffer, udtaAtom.dataOffset, udtaAtom.size - 8);
        const metaAtom = udtaChildren.find((a) => a.type === 'meta');

        if (!metaAtom) {
          console.log('📦 Creating new meta atom in udta...');
          // Create meta > ilst > kaid
          const metaIlstKaid = this.createMetaIlstKaidStructure(kaidAtomData);

          // Rebuild udta with new meta
          const beforeMeta = fileBuffer.slice(udtaAtom.dataOffset, udtaAtom.offset + udtaAtom.size);
          const newUdtaData = Buffer.concat([beforeMeta, metaIlstKaid]);
          const newUdta = this.createAtom('udta', newUdtaData);

          // Rebuild moov
          const beforeUdta = fileBuffer.slice(moovAtom.dataOffset, udtaAtom.offset);
          const afterUdta = fileBuffer.slice(
            udtaAtom.offset + udtaAtom.size,
            moovAtom.offset + moovAtom.size
          );

          newMoovData = Buffer.concat([beforeUdta, newUdta, afterUdta]);
        } else {
          console.log('📦 Updating existing meta atom...');
          // Update ilst in meta with new kaid
          const newMetaData = this.updateMetaWithKaid(fileBuffer, metaAtom, kaidAtomData);
          const newMeta = this.createAtom('meta', newMetaData);

          // Rebuild udta
          const beforeMeta = fileBuffer.slice(udtaAtom.dataOffset, metaAtom.offset);
          const afterMeta = fileBuffer.slice(
            metaAtom.offset + metaAtom.size,
            udtaAtom.offset + udtaAtom.size
          );
          const newUdtaData = Buffer.concat([beforeMeta, newMeta, afterMeta]);
          const newUdta = this.createAtom('udta', newUdtaData);

          // Rebuild moov
          const beforeUdta = fileBuffer.slice(moovAtom.dataOffset, udtaAtom.offset);
          const afterUdta = fileBuffer.slice(
            udtaAtom.offset + udtaAtom.size,
            moovAtom.offset + moovAtom.size
          );

          newMoovData = Buffer.concat([beforeUdta, newUdta, afterUdta]);
        }
      }

      // Create new moov atom
      const newMoov = this.createAtom('moov', newMoovData);

      // Calculate size delta (how much moov grew)
      // NOTE: moovAtom.size already includes the 8-byte header
      const oldMoovSize = moovAtom.size;
      const newMoovSize = newMoov.length;
      const sizeDelta = newMoovSize - oldMoovSize;

      console.log(
        `📊 Moov size change: ${oldMoovSize} -> ${newMoovSize} (delta: ${sizeDelta} bytes)`
      );

      // CRITICAL: Update chunk offset tables before rebuilding file
      // When moov grows, all data after it shifts, so chunk offsets must be updated
      if (sizeDelta !== 0) {
        const originalMoovEnd = moovAtom.offset + oldMoovSize;
        console.log('🔧 Updating chunk offset tables...');
        this.updateChunkOffsets(newMoov, sizeDelta, originalMoovEnd);
      }

      // Rebuild entire file
      const beforeMoov = fileBuffer.slice(0, moovAtom.offset);
      const afterMoov = fileBuffer.slice(moovAtom.offset + moovAtom.size);

      const newFileBuffer = Buffer.concat([beforeMoov, newMoov, afterMoov]);

      // Write to output
      await fs.promises.writeFile(outputPath, newFileBuffer);

      console.log('✅ Successfully injected kaid atom into M4A file');

      return { success: true };
    } catch (error) {
      console.error('❌ Failed to inject kaid atom:', error);
      throw new Error(`Failed to inject kaid atom: ${error.message}`);
    }
  }

  /**
   * Parse MP4 atoms from buffer
   */
  static parseMP4Atoms(buffer, offset = 0, maxLength = null) {
    const atoms = [];
    const endOffset = maxLength ? offset + maxLength : buffer.length;
    let pos = offset;

    while (pos < endOffset - 8) {
      // Read size (4 bytes) and type (4 bytes)
      const size = buffer.readUInt32BE(pos);
      const type = buffer.toString('utf8', pos + 4, pos + 8);

      if (size === 0 || size > buffer.length - pos) {
        break; // Invalid atom
      }

      atoms.push({
        type,
        offset: pos,
        size,
        dataOffset: pos + 8,
      });

      pos += size;
    }

    return atoms;
  }

  /**
   * Create an MP4 atom with type and data
   */
  static createAtom(type, data) {
    const size = 8 + data.length;
    const header = Buffer.alloc(8);
    header.writeUInt32BE(size, 0);
    header.write(type, 4, 4, 'utf8');
    return Buffer.concat([header, data]);
  }

  /**
   * Create kaid atom with JSON data
   */
  static createKaidAtom(kaidJson) {
    // Custom atom format: ----:com.stems:kaid
    // Structure: [mean][name][data]

    const namespace = 'com.stems';
    const name = 'kaid';
    const jsonData = Buffer.from(kaidJson, 'utf8');

    // Create 'mean' atom (namespace)
    const meanData = Buffer.alloc(4 + namespace.length);
    meanData.writeUInt32BE(0, 0); // Version/flags
    meanData.write(namespace, 4, namespace.length, 'utf8');
    const meanAtom = this.createAtom('mean', meanData);

    // Create 'name' atom
    const nameData = Buffer.alloc(4 + name.length);
    nameData.writeUInt32BE(0, 0); // Version/flags
    nameData.write(name, 4, name.length, 'utf8');
    const nameAtom = this.createAtom('name', nameData);

    // Create 'data' atom
    const dataHeader = Buffer.alloc(8);
    dataHeader.writeUInt32BE(1, 0); // Type: UTF-8 text
    dataHeader.writeUInt32BE(0, 4); // Locale
    const dataAtom = this.createAtom('data', Buffer.concat([dataHeader, jsonData]));

    // Create ---- atom (freeform)
    const freeformData = Buffer.concat([meanAtom, nameAtom, dataAtom]);
    return this.createAtom('----', freeformData);
  }

  /**
   * Create meta > ilst > kaid structure
   */
  static createMetaIlstKaidStructure(kaidAtomData) {
    // Create ilst with kaid
    const ilstData = kaidAtomData;
    const ilst = this.createAtom('ilst', ilstData);

    // Create meta with version/flags (0) + hdlr + ilst
    const metaVersion = Buffer.alloc(4);
    metaVersion.writeUInt32BE(0, 0);

    // Create hdlr atom for meta
    const hdlrData = Buffer.from([
      0x00,
      0x00,
      0x00,
      0x00, // Version/flags
      0x00,
      0x00,
      0x00,
      0x00, // Pre-defined
      0x6d,
      0x64,
      0x69,
      0x72, // Handler type: 'mdir'
      0x61,
      0x70,
      0x70,
      0x6c, // Reserved: 'appl'
      0x00,
      0x00,
      0x00,
      0x00, // Reserved
      0x00,
      0x00,
      0x00,
      0x00, // Reserved
      0x00, // Name (empty)
    ]);
    const hdlr = this.createAtom('hdlr', hdlrData);

    return Buffer.concat([metaVersion, hdlr, ilst]);
  }

  /**
   * Update meta atom with new kaid data
   */
  static updateMetaWithKaid(fileBuffer, metaAtom, kaidAtomData) {
    // Parse meta children (skip 4-byte version/flags)
    const metaChildren = this.parseMP4Atoms(
      fileBuffer,
      metaAtom.dataOffset + 4,
      metaAtom.size - 12
    );
    const ilstAtom = metaChildren.find((a) => a.type === 'ilst');

    if (!ilstAtom) {
      console.log('📦 Creating new ilst in meta...');
      // Add ilst to end of meta
      const beforeIlst = fileBuffer.slice(
        metaAtom.dataOffset,
        metaAtom.dataOffset + metaAtom.size - 8
      );
      const ilst = this.createAtom('ilst', kaidAtomData);
      return Buffer.concat([beforeIlst, ilst]);
    }

    // Parse ilst children to find existing kaid
    const ilstChildren = this.parseMP4Atoms(fileBuffer, ilstAtom.dataOffset, ilstAtom.size - 8);
    const existingKaid = ilstChildren.find((a) => a.type === '----');

    if (existingKaid) {
      console.log('📦 Replacing existing kaid atom...');
      // Replace existing kaid
      const beforeKaid = fileBuffer.slice(ilstAtom.dataOffset, existingKaid.offset);
      const afterKaid = fileBuffer.slice(
        existingKaid.offset + existingKaid.size,
        ilstAtom.offset + ilstAtom.size
      );
      const newIlstData = Buffer.concat([beforeKaid, kaidAtomData, afterKaid]);
      const newIlst = this.createAtom('ilst', newIlstData);

      // Rebuild meta
      const beforeIlst = fileBuffer.slice(metaAtom.dataOffset, ilstAtom.offset);
      const afterIlst = fileBuffer.slice(
        ilstAtom.offset + ilstAtom.size,
        metaAtom.offset + metaAtom.size
      );

      return Buffer.concat([beforeIlst, newIlst, afterIlst]);
    } else {
      console.log('📦 Adding new kaid atom to ilst...');
      // Add kaid to ilst
      const beforeNewKaid = fileBuffer.slice(
        ilstAtom.dataOffset,
        ilstAtom.dataOffset + ilstAtom.size - 8
      );
      const newIlstData = Buffer.concat([beforeNewKaid, kaidAtomData]);
      const newIlst = this.createAtom('ilst', newIlstData);

      // Rebuild meta
      const beforeIlst = fileBuffer.slice(metaAtom.dataOffset, ilstAtom.offset);
      const afterIlst = fileBuffer.slice(
        ilstAtom.offset + ilstAtom.size,
        metaAtom.offset + metaAtom.size
      );

      return Buffer.concat([beforeIlst, newIlst, afterIlst]);
    }
  }

  /**
   * Update chunk offset tables (stco/co64) in moov atom
   * This is CRITICAL when modifying moov size - prevents file corruption
   */
  static updateChunkOffsets(moovBuffer, sizeDelta, shiftThreshold) {
    let stcoCount = 0;
    let co64Count = 0;
    let totalUpdated = 0;

    const searchAtoms = (buffer, start, end) => {
      let pos = start;

      while (pos < end - 8 && pos < buffer.length - 8) {
        try {
          const size = buffer.readUInt32BE(pos);
          if (size < 8 || size > end - pos) {
            pos += 8;
            continue;
          }

          const atype = buffer.toString('utf8', pos + 4, pos + 8);

          // Update 32-bit chunk offset table (stco)
          if (atype === 'stco') {
            stcoCount++;
            const entryCount = buffer.readUInt32BE(pos + 12);
            console.log(`  Found stco at position ${pos}, ${entryCount} entries`);

            for (let i = 0; i < entryCount; i++) {
              const offsetPos = pos + 16 + i * 4;
              const chunkOffset = buffer.readUInt32BE(offsetPos);

              // Only update offsets pointing to data after the original moov end
              if (chunkOffset >= shiftThreshold) {
                const newOffset = chunkOffset + sizeDelta;
                buffer.writeUInt32BE(newOffset, offsetPos);
                totalUpdated++;
                if (i < 3) {
                  console.log(`    Entry ${i}: ${chunkOffset} -> ${newOffset}`);
                }
              }
            }
          }
          // Update 64-bit chunk offset table (co64)
          else if (atype === 'co64') {
            co64Count++;
            const entryCount = buffer.readUInt32BE(pos + 12);
            console.log(`  Found co64 at position ${pos}, ${entryCount} entries`);

            for (let i = 0; i < entryCount; i++) {
              const offsetPos = pos + 16 + i * 8;
              // Read as BigInt for 64-bit values
              const chunkOffset = Number(buffer.readBigUInt64BE(offsetPos));

              // Only update offsets pointing to data after the original moov end
              if (chunkOffset >= shiftThreshold) {
                const newOffset = chunkOffset + sizeDelta;
                buffer.writeBigUInt64BE(BigInt(newOffset), offsetPos);
                totalUpdated++;
                if (i < 3) {
                  console.log(`    Entry ${i}: ${chunkOffset} -> ${newOffset}`);
                }
              }
            }
          }
          // Recursively search container atoms
          else if (['trak', 'mdia', 'minf', 'stbl', 'moov'].includes(atype)) {
            searchAtoms(buffer, pos + 8, pos + size);
          }

          pos += size;
        } catch (error) {
          console.warn(`  Error parsing atom at ${pos}:`, error.message);
          pos += 8;
        }
      }
    };

    searchAtoms(moovBuffer, 0, moovBuffer.length);
    console.log(
      `✅ Chunk offset update complete: ${stcoCount} stco + ${co64Count} co64 atoms, ${totalUpdated} offsets updated`
    );
  }

  /**
   * Prepare kaid data structure from song data
   * @param {Object} songData - Song data with updates
   * @returns {Object} kaid JSON structure
   */
  static prepareKaidData(songData) {
    const kaidData = {
      // Audio configuration
      audio: {
        sources: (songData.audio?.sources || []).map((source, index) => ({
          id: source.name || source.filename,
          role: source.name || source.filename,
          track: source.trackIndex !== undefined ? source.trackIndex : index,
        })),
        profile: songData.audio?.profile || songData.meta?.profile || 'STEMS-4',
        encoder_delay_samples: songData.audio?.timing?.encoderDelaySamples || 0,
        presets: songData.audio?.presets || [],
      },

      // Timing information
      timing: {
        offset_sec: songData.audio?.timing?.offsetSec || 0,
      },

      // Lyrics (lines)
      lines: (songData.lyrics || []).map((line) => ({
        start: line.start || line.startTimeSec || 0,
        end: line.end || line.endTimeSec || 0,
        text: line.text || '',
        ...(line.disabled && { disabled: true }),
      })),

      // Optional: vocal pitch data
      ...(songData.features?.vocalPitch && {
        vocal_pitch: songData.features.vocalPitch,
      }),

      // Optional: onsets data
      ...(songData.features?.onsets && {
        onsets: songData.features.onsets,
      }),

      // Optional: tempo/meter data
      ...(songData.features?.tempo && {
        meter: songData.features.tempo,
      }),

      // Optional: singers
      ...(songData.singers &&
        songData.singers.length > 0 && {
          singers: songData.singers,
        }),
    };

    return kaidData;
  }

  /**
   * Validate M4A file has kaid atom
   * @param {string} m4aPath - Path to M4A file
   * @returns {Promise<boolean>} True if valid M4A with kaid
   */
  static async validate(m4aPath) {
    try {
      const mm = await import('music-metadata');
      const mmData = await mm.parseFile(m4aPath);

      // Check for kaid atom
      if (mmData.native && mmData.native.iTunes) {
        const kaidAtom = mmData.native.iTunes.find((tag) => tag.id === '----:com.stems:kaid');
        return Boolean(kaidAtom);
      }

      return false;
    } catch (error) {
      console.error('Validation failed:', error);
      return false;
    }
  }
}

export default M4AWriter;
