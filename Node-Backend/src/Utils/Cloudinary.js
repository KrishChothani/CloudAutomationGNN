import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { console } from "inspector";
import { copyStringIntoBuffer } from "pdf-lib";
import streamifier from "streamifier"; 
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  console.log(localFilePath);
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto", // Ensures PDF is treated as a raw file
      // folder: "pdfs", // Optional: Organize files
      use_filename: true,
      unique_filename: false,
      access_mode: "public", // Ensure public access
    });
    return response;
  } catch (er) {
    console.log(er)
    fs.unlinkSync(localFilePath);
    return null;
  }
};


const uploadBufferToCloudinary = (buffer, clientName) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw", // Because it's a PDF
        folder: "bills", // Optional: group in folder
        public_id: `${clientName.replace(/\s+/g, "_")}.pdf`, // Sanitize name
        use_filename: true,
        unique_filename: false,
        access_mode: "public",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};


export { uploadOnCloudinary, uploadBufferToCloudinary };

// import { v2 as cloudinary } from "cloudinary";
// import stream from "stream";

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// /**
//  * Uploads a file buffer directly to Cloudinary without saving to disk
//  * @param {Buffer} buffer - The file buffer (PDF, image, etc.)
//  * @param {string} folder - Optional Cloudinary folder
//  */
// const uploadOnCloudinary = async (buffer, folder = "bills") => {
//   return new Promise((resolve, reject) => {
//     const uploadStream = cloudinary.uploader.upload_stream(
//       {
//         resource_type: "raw", // important for uploading non-image files like PDFs
//         folder: folder,
//         use_filename: true,
//         unique_filename: false,
//         access_mode: "public",
//       },
//       (error, result) => {
//         if (error) {
//           console.error("Upload error:", error);
//           return reject(error);
//         }
//         resolve(result);
//       }
//     );

//     const bufferStream = new stream.PassThrough();
//     bufferStream.end(buffer);
//     bufferStream.pipe(uploadStream);
//   });
// };

// export { uploadOnCloudinary };
