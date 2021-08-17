import { Document, ObjectId, Types } from "mongoose";
import { MongooseGridFS } from "mongoose-gridfs";

export default interface IAudioFile extends Document {
  length: number;
  aliases: string[];
  chunkSize: number;
  uploadDate: Date;
  fileName: string;
  md5: string;
}
