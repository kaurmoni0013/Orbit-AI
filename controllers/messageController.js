
import Chat from "../model/chatSchema.js";
import Message from "../model/messageSchema.js";
// getMessage , sendMessage

export const getMessage = async(req,res)=>{
    try{

        const {chatId} = req.params;

        // verify that this chatId belongs to this user or not

        const chat = await chatId.findOne({
            _id:chatId,
            userId:req.user_id
        });
        if(!chat){
            return res.status(404).json({
                message:"Chat not found"
            });
        }

        const message = await Message.find({
            chatId: chatId
        }).sort({createdAt: 1});

        res.status(200).json({
          message:"Your all messages are here" ,
          msg: message, 
        })

    }
    catch(err){
        console.log(err);
        res.status(500).json({
            message:"Internal server error"
        })
    }
}

export const sendMessage = async(req,res)=>{
    try{
       const {chatId} = req.params;
       const{content} = req.body;

       if(!content || content.trim === ""){
            return res.status(400).json({
                message:"You didn't send any message"
            })
       }
    //    verify that chat id belongs to particular user or not

    const chat = await Chat.findOne({
        _id: chatId,
        userId: req.user._id
    })


    }
    catch(err){
        console.log(err);
        res.status(500).json({
            message:"Internal server error"
        })
    }
    
}